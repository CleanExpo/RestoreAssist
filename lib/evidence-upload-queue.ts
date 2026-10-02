/**
 * Evidence Upload Queue — RA-1462
 *
 * IndexedDB-backed offline queue for photo / evidence uploads.
 *
 * Scope: when a contractor captures a photo while offline, the blob is
 * stored locally. When connectivity returns (online event or SW
 * Background Sync with tag "evidence-upload-sync"), the queue drains
 * against the existing POST /api/inspections/[id]/photos multipart endpoint.
 *
 * BROWSER ONLY — uses IndexedDB. All public functions guard against SSR.
 *
 * Sibling to lib/nir-sync-queue.ts (which handles inspection JSON writes).
 * Kept separate because photo uploads are multipart/form-data + File blobs,
 * incompatible with that module's JSON-payload queue schema.
 *
 * RA-1610: photos are compressed (downscale + WebP) before being written to
 * IndexedDB — see lib/image-compression.ts. This shrinks both the on-device
 * queue footprint and the eventual upload payload. Compression happens here,
 * before any chain-of-custody hash is computed by the caller, so the
 * cocoaSha256 the caller sends alongside the queued entry's bytes (see
 * cocoa-client.ts) stays consistent with what actually gets uploaded.
 *
 * RA-6997: the cocoaSha256 above is computed IN HERE, over the post-
 * compression bytes, not by the caller — the caller (CapturePhotoFab) only
 * ever has the pre-compression hash (computed at capture time for the direct
 * fast-path upload), and that hash would fail the server's mismatch check
 * against the compressed bytes this module actually queues and later
 * uploads. Capture-time metadata (caption/GPS/capturedAtUtc) is threaded
 * through too, so a queued upload carries the same custody fields the
 * direct path sends.
 */

import { getOfflineOwner, requireOfflineOwner, ownsOfflineEntry, fetchOfflineReplay, withOfflineDrainLock, type OfflineOwner } from "@/lib/offline/account-boundary";
import { sameOfflineOwner } from "@/lib/offline/ownership";
import { notifySyncQueueChanged } from "@/lib/offline/sync-status-event";

import { compressImageForUpload } from "./image-compression";
import { computeSha256 } from "./capture/cocoa-client";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DB_NAME = "ra-evidence-queue";
const DB_VERSION = 1;
const STORE = "uploads";

/** Active captures per verified owner; retained/foreign rows have a separate bound. */
const MAX_QUEUE_SIZE = 50;
// Keep headroom for retained evidence across account changes without deleting
// anyone's unsynced bytes. The device still has a hard row and byte budget.
const MAX_STORED_ENTRIES = 250;
const MAX_STORED_BYTES = 250 * 1024 * 1024;

const MAX_RETRY_COUNT = 5;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface EvidenceQueueEntry {
  owner?: OfflineOwner;
  /** Stable client-side id — used for dedupe via Idempotency-Key header */
  id: string;
  inspectionId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  /** Optional EXIF-free location label (not GPS) */
  location?: string;
  /** ISO timestamp when queued */
  queuedAt: string;
  retryCount: number;
  /** Last HTTP response code, for an actionable recovery message. */
  lastStatus?: number;
  /** POST succeeded, but owner-scoped readback did not verify the photo. */
  readbackPending?: boolean;
  readbackStatus?: number;
  /** Direct photo POST retry: keep the original request's byte/field shape. */
  directRetry?: boolean;
  /** Exact hash field from the first direct request, if it included one. */
  directCocoaSha256?: string;
  /** RA-1610 — bytes before client-side compression, for telemetry */
  originalSize: number;
  /** RA-1610 — bytes actually queued (post-compression), for telemetry */
  compressedSize: number;
  /**
   * RA-6997 — chain-of-custody hash (rule 21), computed here over the
   * post-compression bytes actually stored in `blob`. Sent as `cocoaSha256`
   * on drain so the server's mismatch check passes against the bytes it
   * receives.
   */
  cocoaSha256: string;
  /** RA-6997 — optional capture-time metadata, carried through to drain. */
  caption?: string;
  photoStage?: string;
  gpsLat?: number;
  gpsLng?: number;
  capturedAtUtc?: string;
}

// ─── DATABASE ─────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable in server context"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      _db = request.result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

function generateId(): string {
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Swaps (or appends) a `.webp` extension once a photo has been re-encoded. */
function renameToWebp(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return `${base}.webp`;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Queue an evidence blob for upload when connectivity returns. Compresses
 * (downscale + WebP, see lib/image-compression.ts) before writing to
 * IndexedDB — see RA-1610 note at the top of this file for why compression
 * runs before any custody hash the caller computes.
 *
 * Returns the entry id (also used as Idempotency-Key).
 *
 * Throws when this owner's active queue or the device storage budget is full.
 * Existing evidence is retained; callers keep the unsaved capture open.
 */
export async function queueEvidenceUpload(input: {
  inspectionId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  location?: string;
  /** RA-6997 — capture-time metadata, carried through to the eventual upload. */
  caption?: string;
  photoStage?: string;
  gps?: { lat: number; lng: number } | null;
  capturedAtUtc?: string;
  /** Same key as an uncertain direct POST, to make replay idempotent. */
  directRetryKey?: string;
  directCocoaSha256?: string;
}): Promise<string> {
  const owner = requireOfflineOwner();
  const db = await openDatabase();

  if (input.directRetryKey && !/^[\x21-\x7e]{8,255}$/.test(input.directRetryKey)) {
    throw new Error("Invalid photo retry key");
  }
  const compressed = input.directRetryKey
    ? { blob: input.blob, originalSize: input.blob.size, compressedSize: input.blob.size, format: input.mimeType, skipped: true }
    : await compressImageForUpload(input.blob);

  // RA-6997: hash the bytes that will actually be uploaded (post-compression),
  // not the caller's pre-compression hash — see the RA-6997 module note above.
  const cocoaSha256 = await computeSha256(compressed.blob);

  if (!ownsOfflineEntry({ owner })) throw new Error("Offline account changed; photo was not overwritten");
  const entry: EvidenceQueueEntry = {
    owner,
    id: input.directRetryKey ?? generateId(),
    inspectionId: input.inspectionId,
    blob: compressed.blob,
    filename: compressed.skipped
      ? input.filename
      : renameToWebp(input.filename),
    mimeType: compressed.format,
    location: input.location,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    directRetry: Boolean(input.directRetryKey),
    directCocoaSha256: input.directCocoaSha256,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
    cocoaSha256,
    caption: input.caption,
    photoStage: input.photoStage,
    gpsLat: input.gps?.lat,
    gpsLng: input.gps?.lng,
    capturedAtUtc: input.capturedAtUtc,
  };

  await new Promise<void>((resolve, reject) => {
    // Count and add in one write transaction: concurrent tabs cannot both
    // claim the last slot after independent readonly capacity checks.
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let failure: Error | null = null;
    const refuse = (message: string) => { failure = new Error(message); tx.abort(); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failure ?? tx.error);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("Photo was not saved; keep this capture open and retry"));
    const read = store.getAll() as IDBRequest<EvidenceQueueEntry[]>;
    read.onsuccess = () => {
      if (!ownsOfflineEntry({ owner })) return refuse("Offline account changed; photo was not overwritten");
      const entries = read.result;
      const active = entries.filter((row) => sameOfflineOwner(row.owner, owner) && row.retryCount < MAX_RETRY_COUNT).length;
      if (active >= MAX_QUEUE_SIZE) return refuse(`Evidence queue full (${MAX_QUEUE_SIZE}) — sync pending uploads before capturing more`);
      const storedBytes = entries.reduce((total, row) => total + (row.blob?.size ?? 0), 0);
      if (entries.length >= MAX_STORED_ENTRIES || storedBytes + entry.blob.size > MAX_STORED_BYTES) {
        return refuse("Device evidence storage is full. Existing photos are preserved; keep this capture open and reconnect to sync your account's uploads.");
      }
      store.add(entry);
    };
  });
  notifySyncQueueChanged();

  // Request Background Sync if supported (Chromium / Edge / Android)
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((sw) =>
        // The DOM lib's SyncManager types are behind a flag — safe any-cast.
        (
          sw as unknown as {
            sync: { register: (tag: string) => Promise<void> };
          }
        ).sync.register("evidence-upload-sync"),
      )
      .catch(() => {
        /* SW not yet active, online event will still drain */
      });
  }

  return entry.id;
}

/** Count pending evidence uploads — drives the "N pending" badge. */
export async function getQueuedEvidenceCount(strict = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await openDatabase();
    return (await listAll(db)).filter(ownsOfflineEntry).length;
  } catch (error) {
    if (strict) throw error;
    return 0;
  }
}

/** Owner-scoped, job-scoped pending entries. Never deletes failed evidence. */
export async function getQueuedEvidenceForInspection(inspectionId: string): Promise<EvidenceQueueEntry[]> {
  if (typeof window === "undefined") return [];
  if (!getOfflineOwner()) throw new Error("Verify your account to view saved device photos");
  const db = await openDatabase();
  return (await listAll(db)).filter((entry) =>
    entry.inspectionId === inspectionId && ownsOfflineEntry(entry),
  );
}

/** Restart an exhausted entry only after an explicit user retry. */
export async function retryQueuedEvidence(id: string, inspectionId: string): Promise<number> {
  const owner = requireOfflineOwner();
  if (!navigator.onLine) throw new Error("Reconnect before retrying this photo. The saved copy remains on this device.");
  if (!navigator.locks?.request) throw new Error("Automatic retry is unavailable in this browser. Save a backup and upload it from the job photo screen. The saved copy remains on this device.");
  const db = await openDatabase();
  const rows = await listAll(db);
  const entry = rows.find((row) => row.id === id && row.inspectionId === inspectionId && ownsOfflineEntry(row));
  if (!entry || !sameOfflineOwner(entry.owner, owner)) {
    throw new Error("Queued photo is unavailable for this account and job");
  }
  if (entry.retryCount >= MAX_RETRY_COUNT) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const read = store.get(id) as IDBRequest<EvidenceQueueEntry | undefined>;
      read.onsuccess = () => {
        const current = read.result;
        if (!current || current.inspectionId !== inspectionId || !ownsOfflineEntry(current)) {
          tx.abort();
          return;
        }
        store.put({ ...current, retryCount: 0, lastStatus: undefined });
      };
      tx.oncomplete = () => { notifySyncQueueChanged(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Account changed; queued photo was preserved"));
    });
  }
  return withOfflineDrainLock("ra-evidence-drain", () => drainEvidenceQueueImpl(id));
}

/**
 * Drain the evidence queue against POST /api/inspections/[id]/photos.
 * Called by the reconnect listener and by the SW Background Sync handler
 * (via postMessage → client).
 *
 * Returns the number of blobs successfully uploaded.
 */
export async function drainEvidenceQueue(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine || !getOfflineOwner()) return 0;
  return withOfflineDrainLock("ra-evidence-drain", drainEvidenceQueueImpl);
}

async function drainEvidenceQueueImpl(onlyId?: string): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return 0;
  }

  const entries = await listAll(db);
  let uploaded = 0;

  for (const entry of entries) {
    if (onlyId && entry.id !== onlyId) continue;
    if (!ownsOfflineEntry(entry)) continue;
    if (entry.retryCount >= MAX_RETRY_COUNT) {
      // Preserve failed uploads for recovery; never delete unsynced evidence.
      continue;
    }

    try {
      const form = new FormData();
      form.append(
        "file",
        new File([entry.blob], entry.filename, { type: entry.mimeType }),
      );
      if (entry.location !== undefined) form.append("location", entry.location);
      // Direct retries must preserve the original field order: the photo
      // route fingerprints ordered multipart entries as well as file bytes.
      if (entry.caption !== undefined)
        form.append("caption", entry.caption);
      // RA-6997 — carry custody + capture metadata through to the same
      // fields the direct upload path sends. Guarded: entries queued by an
      // older app version may predate cocoaSha256 and shouldn't send a
      // literal "undefined" string.
      if (entry.directRetry ? entry.directCocoaSha256 : entry.cocoaSha256) {
        form.append("cocoaSha256", entry.directRetry ? entry.directCocoaSha256! : entry.cocoaSha256);
      }
      if (entry.capturedAtUtc)
        form.append("capturedAtUtc", entry.capturedAtUtc);
      if (entry.photoStage !== undefined)
        form.append("photoStage", entry.photoStage);
      if (entry.gpsLat !== undefined)
        form.append("gpsLat", String(entry.gpsLat));
      if (entry.gpsLng !== undefined)
        form.append("gpsLng", String(entry.gpsLng));

      const response = await fetchOfflineReplay(
        entry.owner,
        `/api/inspections/${entry.inspectionId}/photos`,
        {
          method: "POST",
          body: form,
          // Endpoint accepts cookies for next-auth session; no explicit header needed.
          // Idempotency-Key is enforced server-side for multipart photo replay.
          headers: { "Idempotency-Key": entry.id },
          credentials: "same-origin",
        },
      );

      if (!response) break;
      if (response.ok) {
        // A successful POST or idempotent replay is not proof that the photo
        // can be reopened. Keep local bytes until this owner can read it from
        // the same inspection's listing, including a usable signed URL.
        const posted = await response.json().catch(() => null);
        const photoId = posted?.photo?.id;
        if (typeof photoId !== "string" || !photoId) {
          // A malformed success response is uncertain for this row, but must
          // not hold later photos hostage in the same queue drain.
          await incrementRetry(db, entry, undefined, "readback");
          continue;
        }
        const readback = await fetchOfflineReplay(entry.owner, `/api/inspections/${entry.inspectionId}/photos`, { cache: "no-store" });
        if (!readback) break;
        const listing = readback.ok ? await readback.json().catch(() => null) : null;
        if (!Array.isArray(listing?.photos) || !listing.photos.some((photo: { id?: string; url?: string }) => photo.id === photoId && typeof photo.url === "string" && Boolean(photo.url.trim()))) {
          await incrementRetry(db, entry, readback.status, "readback");
          continue;
        }
        await removeEntry(db, entry.id);
        uploaded++;
      } else if (response.status === 413) {
        // Keep the bytes; a user can recover the original file.
        await incrementRetry(db, entry, response.status);
      } else {
        await incrementRetry(db, entry, response.status);
      }
    } catch {
      // Network error — still offline or intermittent. Retry next reconnect.
      if (ownsOfflineEntry(entry)) await incrementRetry(db, entry);
    }
  }

  return uploaded;
}

/**
 * Initialise the reconnect listener. Call once from the root offline provider.
 * Returns a cleanup function for useEffect.
 */
export function initEvidenceSyncOnReconnect(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    drainEvidenceQueue().catch((err) =>
      console.warn("[Evidence] Queue drain failed:", err),
    );
  };

  window.addEventListener("online", handler);

  // Listen for Background Sync messages from the service worker.
  // SW posts { type: "NIR_SYNC_TRIGGER", tag } when a sync event fires;
  // only drain when the tag matches evidence uploads.
  const swMessageHandler = (event: MessageEvent) => {
    if (
      event.data?.type === "NIR_SYNC_TRIGGER" &&
      event.data?.tag === "evidence-upload-sync"
    ) {
      handler();
    }
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", swMessageHandler);
  }

  // Drain immediately if already online (e.g. page load after SW install)
  if (navigator.onLine) handler();

  return () => {
    window.removeEventListener("online", handler);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", swMessageHandler);
    }
  };
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function listAll(db: IDBDatabase): Promise<EvidenceQueueEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll() as IDBRequest<
      EvidenceQueueEntry[]
    >;
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function removeEntry(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => { notifySyncQueueChanged(); resolve(); };
  });
}

function incrementRetry(
  db: IDBDatabase,
  entry: EvidenceQueueEntry,
  status?: number,
  stage: "upload" | "readback" = "upload",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx
      .objectStore(STORE)
      .put({ ...entry, retryCount: entry.retryCount + 1,
        lastStatus: stage === "upload" ? status : undefined,
        readbackPending: stage === "readback" || Boolean(entry.readbackPending),
        readbackStatus: stage === "readback" ? status : entry.readbackStatus,
      });
    tx.oncomplete = () => { notifySyncQueueChanged(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}
