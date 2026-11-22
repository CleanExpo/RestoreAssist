/**
 * RA-7877 — start a claim with no signal, then create it exactly once when the
 * network returns.
 *
 * A captured claim is kept on this device (IndexedDB) with a client UUID and
 * the owner it was captured for. On reconnect it is replayed through the
 * existing idempotent POST /api/inspections (Idempotency-Key derived from the
 * client UUID), and its photo is handed to the existing evidence upload queue
 * once the server has returned the new inspection id.
 *
 * Rules this module keeps:
 *   - nothing is invented: no inspection date is sent (the technician enters
 *     it later, or it stays empty — see the API's own note on attendance)
 *   - tenant and user scope: every replay goes through fetchOfflineReplay, so
 *     the server compares the saved owner with the live session on that request
 *     and refuses a mismatch; an entry whose owner is not the verified one is
 *     skipped, never sent, never shown, never deleted
 *   - no duplicates: the server inspection id is stored the moment it is known
 *     and a created claim is never POSTed again; an attempt that might have
 *     succeeded is not re-POSTed once the server's idempotency window has passed
 *   - no loss: a refused or failing claim stays on the device with its reason
 */
import {
  fetchOfflineReplay,
  getOfflineOwner,
  ownsOfflineEntry,
  withOfflineDrainLock,
} from "./account-boundary";
import { loadDeviceIdentity } from "./device-identity";
import { parseOfflineOwner, sameOfflineOwner, type OfflineOwner } from "./ownership";
import { notifySyncQueueChanged } from "./sync-status-event";

const DB_NAME = "ra-offline-claims";
const DB_VERSION = 1;
const STORE = "claims";
export const CLAIM_DRAIN_LOCK_NAME = "ra-offline-claims-drain";

/** Mirrors the server's Idempotency-Key lifetime (lib/idempotency.ts TTL_MS). */
export const CLAIM_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_CLAIM_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_QUEUED_CLAIMS = 50;

export type OfflineClaimState =
  | "queued"
  | "failed" // the server refused the content; kept, needs a person
  | "needs_review"; // a send may have succeeded and can no longer be checked safely

export interface OfflineClaim {
  clientUuid: string;
  owner: OfflineOwner;
  capturedAt: string;
  propertyAddress: string;
  propertyPostcode: string;
  notes: string;
  photo?: { blob: Blob; filename: string; mimeType: string };
  state: OfflineClaimState;
  retryCount: number;
  lastStatus?: number;
  /** Set before the first POST, so an uncertain send is never repeated blindly. */
  postAttemptedAt?: string;
  /** Set as soon as the server confirms; the claim is never POSTed again. */
  serverInspectionId?: string;
  /** Set once the photo is in the evidence queue; it is never handed over twice. */
  photoHandedOver?: boolean;
}

export interface CaptureInput {
  propertyAddress: string;
  propertyPostcode: string;
  notes?: string;
  photo?: File | Blob | null;
  photoName?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientUuid" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close?.();
  }
}

export async function listQueuedClaims(): Promise<OfflineClaim[]> {
  if (typeof indexedDB === "undefined") return [];
  return withStore("readonly", (s) => s.getAll() as IDBRequest<OfflineClaim[]>);
}

/**
 * How many unsent claims rest on this device, for any account. A number only:
 * the sign-out notice shows it without reading or exposing anyone's details.
 */
export async function countUnsentClaims(): Promise<number> {
  try {
    return (await listQueuedClaims()).length;
  } catch {
    return 0;
  }
}

/** Claims this account may see. Another account's claims are never returned. */
export async function listOwnClaims(): Promise<OfflineClaim[]> {
  const owner = getOfflineOwner() ?? (await loadDeviceIdentity())?.owner ?? null;
  if (!owner) return [];
  return (await listQueuedClaims()).filter((c) => sameOfflineOwner(parseOfflineOwner(c.owner), owner));
}

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

/**
 * Save a claim on this device. Needs a verified session OR an unexpired device
 * identity; otherwise it refuses and saves nothing.
 */
export async function captureOfflineClaim(input: CaptureInput): Promise<OfflineClaim> {
  const owner = getOfflineOwner() ?? (await loadDeviceIdentity())?.owner ?? null;
  if (!owner) {
    throw new Error("Sign in while online first. Offline capture opens only for an account that signed in on this device recently.");
  }
  const propertyAddress = clean(input.propertyAddress, 300);
  const propertyPostcode = clean(input.propertyPostcode, 10);
  if (!propertyAddress) throw new Error("Enter the property address.");
  if (!propertyPostcode) throw new Error("Enter the property postcode.");

  let photo: OfflineClaim["photo"];
  if (input.photo && input.photo.size > 0) {
    if (!input.photo.type.startsWith("image/")) throw new Error("The photo must be an image.");
    if (input.photo.size > MAX_CLAIM_PHOTO_BYTES) throw new Error("The photo is larger than 15 MB. Take it again at a lower size.");
    const named = input.photo as File;
    photo = {
      blob: input.photo,
      filename: clean(input.photoName ?? named.name, 120) || "photo.jpg",
      mimeType: input.photo.type,
    };
  }

  if ((await listOwnClaims()).length >= MAX_QUEUED_CLAIMS) {
    throw new Error("This device is holding 50 unsent claims. Reconnect to send them before starting another.");
  }

  const claim: OfflineClaim = {
    clientUuid: crypto.randomUUID(),
    owner,
    capturedAt: new Date().toISOString(),
    propertyAddress,
    propertyPostcode,
    notes: clean(input.notes, 2000),
    photo,
    state: "queued",
    retryCount: 0,
  };
  await withStore("readwrite", (s) => s.add(claim));
  notifySyncQueueChanged();
  return claim;
}

async function put(claim: OfflineClaim): Promise<void> {
  await withStore("readwrite", (s) => s.put(claim));
  notifySyncQueueChanged();
}

async function remove(clientUuid: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(clientUuid));
  notifySyncQueueChanged();
}

function idempotencyKey(claim: OfflineClaim): string {
  return `offline-claim-${claim.clientUuid}`;
}

async function sendOne(claim: OfflineClaim, now: number): Promise<OfflineClaim | null> {
  let current = claim;

  if (!current.serverInspectionId) {
    const attemptedAt = current.postAttemptedAt ? Date.parse(current.postAttemptedAt) : null;
    if (attemptedAt !== null && now - attemptedAt > CLAIM_IDEMPOTENCY_WINDOW_MS) {
      // The first send may have created the job; the server can no longer
      // recognise a repeat. Keep it for a person rather than risk a duplicate.
      const held: OfflineClaim = { ...current, state: "needs_review" };
      await put(held);
      return held;
    }
    if (attemptedAt === null) {
      current = { ...current, postAttemptedAt: new Date(now).toISOString() };
      await put(current);
    }
    let response: Response | null;
    try {
      response = await fetchOfflineReplay(current.owner, "/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(current) },
        // No inspectionDate on purpose: it is never invented.
        body: JSON.stringify({
          propertyAddress: current.propertyAddress,
          propertyPostcode: current.propertyPostcode,
          ...(current.notes ? { lossDescription: current.notes } : {}),
        }),
      });
    } catch {
      response = null;
    }
    if (!response) {
      // Offline, paused, or the account changed: nothing was sent or refused.
      return current;
    }
    if (response.status === 201 || response.status === 200) {
      const body = await response.json().catch(() => null);
      const id = typeof body?.inspection?.id === "string" ? body.inspection.id : null;
      if (!id) {
        const held = { ...current, retryCount: current.retryCount + 1, lastStatus: response.status };
        await put(held);
        return held;
      }
      current = { ...current, serverInspectionId: id, lastStatus: response.status, state: "queued" };
      await put(current);
    } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409 && response.status !== 429) {
      const failed: OfflineClaim = { ...current, state: "failed", lastStatus: response.status, retryCount: current.retryCount + 1 };
      await put(failed);
      return failed;
    } else {
      const retry = { ...current, retryCount: current.retryCount + 1, lastStatus: response.status };
      await put(retry);
      return retry;
    }
  }

  if (current.photo && !current.photoHandedOver) {
    const evidence = await import("@/lib/evidence-upload-queue");
    try {
      // The inspection is new, so evidence already queued for it can only be
      // this claim's photo from an attempt that stopped before it was marked.
      const already = await evidence.getQueuedEvidenceForInspection(current.serverInspectionId!);
      if (already.length === 0) {
        await evidence.queueEvidenceUpload({
          inspectionId: current.serverInspectionId!,
          blob: current.photo.blob,
          filename: current.photo.filename,
          mimeType: current.photo.mimeType,
          capturedAtUtc: current.capturedAt,
        });
      }
      // The evidence queue now holds the bytes; do not keep a second copy.
      current = { ...current, photoHandedOver: true, photo: undefined };
      await put(current);
    } catch {
      // The job exists; the photo stays here and is handed over next time.
      const retry = { ...current, retryCount: current.retryCount + 1 };
      await put(retry);
      return retry;
    }
  }
  await remove(current.clientUuid);
  return null;
}

/** Send every claim that belongs to the verified account. Returns how many were created. */
export async function drainOfflineClaims(now = Date.now()): Promise<number> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined" || !navigator.onLine) return 0;
  if (!getOfflineOwner()) return 0;
  return withOfflineDrainLock(CLAIM_DRAIN_LOCK_NAME, async () => {
    let sent = 0;
    for (const claim of await listQueuedClaims()) {
      if (claim.state !== "queued") continue;
      if (!ownsOfflineEntry({ owner: parseOfflineOwner(claim.owner) })) continue;
      const wasCreated = Boolean(claim.serverInspectionId);
      const result = await sendOne(claim, now);
      if (!wasCreated && (result === null || result.serverInspectionId)) sent++;
    }
    return sent;
  });
}
