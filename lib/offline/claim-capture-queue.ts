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
 *     and a created claim is never POSTed again; the photo has a stable id that
 *     is also its upload Idempotency-Key
 *   - no loss: a refused or failing claim stays on the device with its reason
 *
 * One owner for "might this have been sent already?": attemptState(). A send is
 * marked in the same place it becomes possible (just before the request, after
 * the account has been verified), never earlier, so a claim that was never sent
 * is never held back. An attempt older than the server's idempotency window, or
 * one whose time cannot be read, is held for review instead of repeated.
 */
import {
  fetchOfflineReplay,
  getOfflineOwner,
  ownsOfflineEntry,
  resolveOfflineActor,
  withOfflineDrainLock,
} from "./account-boundary";
import { storeOperation, type StoreSpec } from "./idb-store";
import { parseOfflineOwner, sameOfflineOwner, type OfflineOwner } from "./ownership";
import { notifySyncQueueChanged } from "./sync-status-event";
import { countClaimsByState, type ClaimStateCounts } from "./unsent-claims-message";

const SPEC: StoreSpec = { db: "ra-offline-claims", version: 1, store: "claims", keyPath: "clientUuid" };
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
  /** Set just before the first POST that can reach the server. */
  postAttemptedAt?: string;
  /** Set as soon as the server confirms; the claim is never POSTed again. */
  serverInspectionId?: string;
  /** Set just before the photo is handed to the evidence queue. */
  photoAttemptedAt?: string;
  /** Set once the photo is in the evidence queue; it is never handed over twice. */
  photoHandedOver?: boolean;
}

export interface CaptureInput {
  /**
   * The account the form was opened for. Required: what a person typed belongs
   * to that account only, and is refused if the page now resolves another one.
   */
  openedFor: OfflineOwner;
  propertyAddress: string;
  propertyPostcode: string;
  notes?: string;
  photo?: File | Blob | null;
  photoName?: string;
}

export type AttemptState = "never" | "recent" | "stale" | "invalid";

/** Pure: has this send possibly happened, and can the server still recognise a repeat? */
export function attemptState(attemptedAt: unknown, now: number): AttemptState {
  if (attemptedAt === undefined) return "never";
  const at = typeof attemptedAt === "string" ? Date.parse(attemptedAt) : Number.NaN;
  if (!Number.isFinite(at) || at > now + 60_000) return "invalid";
  return now - at > CLAIM_IDEMPOTENCY_WINDOW_MS ? "stale" : "recent";
}

export async function listQueuedClaims(): Promise<OfflineClaim[]> {
  if (typeof indexedDB === "undefined") return [];
  return storeOperation(SPEC, "readonly", (s) => s.getAll() as IDBRequest<OfflineClaim[]>);
}

/**
 * How many unsent claims rest on this device, for any account, by state.
 * Numbers only: the sign-out notice shows them without reading or exposing
 * anyone's details. The wording is describeUnsentClaims() (RA-8641).
 */
export async function countUnsentClaims(): Promise<ClaimStateCounts> {
  try {
    return countClaimsByState(await listQueuedClaims());
  } catch {
    return countClaimsByState([]);
  }
}

/** Claims this account may see. Another account's claims are never returned. */
export async function listOwnClaims(): Promise<OfflineClaim[]> {
  const owner = await resolveOfflineActor();
  if (!owner) return [];
  const rows = await listQueuedClaims();
  // The account may have changed while the rows were being read.
  if (!sameOfflineOwner(await resolveOfflineActor(), owner)) return [];
  return rows.filter((c) => sameOfflineOwner(parseOfflineOwner(c.owner), owner));
}

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

/**
 * Save a claim on this device. Needs a verified session OR an unexpired device
 * identity; otherwise it refuses and saves nothing. Resolves only after the
 * write has committed.
 */
export async function captureOfflineClaim(input: CaptureInput): Promise<OfflineClaim> {
  const owner = await resolveOfflineActor();
  if (!owner) {
    throw new Error("Sign in while online first. Offline capture opens only for an account that signed in on this device recently.");
  }
  if (!sameOfflineOwner(owner, input.openedFor)) {
    throw new Error("The signed-in account changed. This form was for another account, so it was not saved.");
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
  // The account can change during the awaits above. Never save one account's
  // details under another: re-resolve just before the write.
  if (!sameOfflineOwner(await resolveOfflineActor(), owner)) {
    throw new Error("The signed-in account changed. Your entries are still on the form; try again once your account is verified.");
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
  await storeOperation(SPEC, "readwrite", (s) => s.add(claim));
  notifySyncQueueChanged();
  return claim;
}

async function put(claim: OfflineClaim): Promise<void> {
  await storeOperation(SPEC, "readwrite", (s) => s.put(claim));
  notifySyncQueueChanged();
}

async function remove(clientUuid: string): Promise<void> {
  await storeOperation(SPEC, "readwrite", (s) => s.delete(clientUuid));
  notifySyncQueueChanged();
}

const idempotencyKey = (claim: OfflineClaim) => `offline-claim-${claim.clientUuid}`;
/** Stable: it is the evidence queue entry id and the photo's Idempotency-Key. */
const photoId = (claim: OfflineClaim) => `claim-photo-${claim.clientUuid}`;

async function hold(claim: OfflineClaim): Promise<OfflineClaim> {
  const held: OfflineClaim = { ...claim, state: "needs_review" };
  await put(held);
  return held;
}

type Step = { next: OfflineClaim } | { stop: OfflineClaim };

async function createOnServer(claim: OfflineClaim, now: number): Promise<Step> {
  // Held, not repeated: this send may have created the job and the server can no
  // longer recognise a repeat (or the record of when it was sent is unreadable).
  const before = attemptState(claim.postAttemptedAt, now);
  if (before === "stale" || before === "invalid") return { stop: await hold(claim) };

  let current = claim;
  let response: Response | null;
  try {
    response = await fetchOfflineReplay(
      current.owner,
      "/api/inspections",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(current) },
        // No inspectionDate on purpose: it is never invented.
        body: JSON.stringify({
          propertyAddress: current.propertyAddress,
          propertyPostcode: current.propertyPostcode,
          ...(current.notes ? { lossDescription: current.notes } : {}),
        }),
      },
      // Runs after the account was verified and just before the request, so a
      // refused or unverifiable send never starts the clock.
      async () => {
        if (attemptState(current.postAttemptedAt, now) === "never") {
          current = { ...current, postAttemptedAt: new Date(now).toISOString() };
          await put(current);
        }
      },
      // Definitely not processed (refused at the gate, or the account changed or
      // the call was cancelled before the request was made): the claim is not
      // "possibly created" and must not be held for review.
      async () => {
        current = { ...current, postAttemptedAt: undefined };
        await put(current);
      },
    );
  } catch {
    response = null;
  }
  if (!response) return { stop: current }; // offline, not sent, or account changed
  if (response.status === 201 || response.status === 200) {
    const body = await response.json().catch(() => null);
    const id = typeof body?.inspection?.id === "string" ? body.inspection.id : null;
    if (!id) {
      const unreadable = { ...current, retryCount: current.retryCount + 1, lastStatus: response.status };
      await put(unreadable);
      return { stop: unreadable };
    }
    current = { ...current, serverInspectionId: id, lastStatus: response.status, state: "queued" };
    await put(current);
    return { next: current };
  }
  const permanent = response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status);
  const failed: OfflineClaim = permanent
    ? { ...current, state: "failed", lastStatus: response.status, retryCount: current.retryCount + 1 }
    : { ...current, lastStatus: response.status, retryCount: current.retryCount + 1 };
  await put(failed);
  return { stop: failed };
}

async function handPhotoToEvidenceQueue(claim: OfflineClaim, now: number): Promise<Step> {
  const before = attemptState(claim.photoAttemptedAt, now);
  if (before === "stale" || before === "invalid") return { stop: await hold(claim) };
  let current = claim;
  if (before === "never") {
    current = { ...current, photoAttemptedAt: new Date(now).toISOString() };
    await put(current);
  }
  try {
    const evidence = await import("@/lib/evidence-upload-queue");
    // Stable id = stable Idempotency-Key. Already queued: no second entry.
    // Already uploaded before a crash: the same key replays, never a new photo.
    await evidence.queueEvidenceUpload({
      id: photoId(current),
      inspectionId: current.serverInspectionId!,
      blob: current.photo!.blob,
      filename: current.photo!.filename,
      mimeType: current.photo!.mimeType,
      capturedAtUtc: current.capturedAt,
    });
  } catch {
    // Definitely not queued: the photo waits here and is handed over next time,
    // so the "attempted" mark is cleared and cannot strand it.
    const retry: OfflineClaim = { ...current, photoAttemptedAt: undefined, retryCount: current.retryCount + 1 };
    await put(retry);
    return { stop: retry };
  }
  // The evidence queue now holds the bytes; do not keep a second copy.
  current = { ...current, photoHandedOver: true, photo: undefined };
  await put(current);
  return { next: current };
}

async function sendOne(claim: OfflineClaim, now: number): Promise<OfflineClaim | null> {
  let current = claim;
  if (!current.serverInspectionId) {
    const step = await createOnServer(current, now);
    if ("stop" in step) return step.stop;
    current = step.next;
  }
  if (current.photo && !current.photoHandedOver) {
    const step = await handPhotoToEvidenceQueue(current, now);
    if ("stop" in step) return step.stop;
    current = step.next;
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
