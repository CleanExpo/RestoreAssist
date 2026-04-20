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
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DB_NAME = "ra-evidence-queue";
const DB_VERSION = 1;
const STORE = "uploads";

/** Cap queue size to avoid IndexedDB blowout on a long offline session. */
const MAX_QUEUE_SIZE = 50;

const MAX_RETRY_COUNT = 5;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface EvidenceQueueEntry {
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

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Queue an evidence blob for upload when connectivity returns.
 * Returns the entry id (also used as Idempotency-Key).
 *
 * Throws if the queue is already at MAX_QUEUE_SIZE — the caller should
 * surface an error to the contractor to free up space before capturing more.
 */
export async function queueEvidenceUpload(input: {
  inspectionId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  location?: string;
}): Promise<string> {
  const db = await openDatabase();

  const count = await countQueue();
  if (count >= MAX_QUEUE_SIZE) {
    throw new Error(
      `Evidence queue full (${MAX_QUEUE_SIZE}) — sync pending uploads before capturing more`,
    );
  }

  const entry: EvidenceQueueEntry = {
    id: generateId(),
    inspectionId: input.inspectionId,
    blob: input.blob,
    filename: input.filename,
    mimeType: input.mimeType,
    location: input.location,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Request Background Sync if supported (Chromium / Edge / Android)
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((sw) =>
        // The DOM lib's SyncManager types are behind a flag — safe any-cast.
        ((sw as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync).register(
          "evidence-upload-sync",
        ),
      )
      .catch(() => {
        /* SW not yet active, online event will still drain */
      });
  }

  return entry.id;
}

/** Count pending evidence uploads — drives the "N pending" badge. */
export async function getQueuedEvidenceCount(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    return await countQueue();
  } catch {
    return 0;
  }
}

/**
 * Drain the evidence queue against POST /api/inspections/[id]/photos.
 * Called by the reconnect listener and by the SW Background Sync handler
 * (via postMessage → client).
 *
 * Returns the number of blobs successfully uploaded.
 */
export async function drainEvidenceQueue(): Promise<number> {
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
    if (entry.retryCount >= MAX_RETRY_COUNT) {
      // Give up and remove — entry is likely corrupt or auth is permanently broken.
      await removeEntry(db, entry.id);
      continue;
    }

    try {
      const form = new FormData();
      form.append(
        "file",
        new File([entry.blob], entry.filename, { type: entry.mimeType }),
      );
      if (entry.location) form.append("location", entry.location);

      const response = await fetch(
        `/api/inspections/${entry.inspectionId}/photos`,
        {
          method: "POST",
          body: form,
          // Endpoint accepts cookies for next-auth session; no explicit header needed.
          // Idempotency-Key is advisory — the endpoint does not yet dedupe on it,
          // but sending it future-proofs retries (rule #24, #27).
          headers: { "Idempotency-Key": entry.id },
          credentials: "same-origin",
        },
      );

      if (response.ok) {
        await removeEntry(db, entry.id);
        uploaded++;
      } else if (response.status === 401 || response.status === 413) {
        // Auth expired or file too large — no point retrying.
        await removeEntry(db, entry.id);
      } else {
        await incrementRetry(db, entry);
      }
    } catch {
      // Network error — still offline or intermittent. Retry next reconnect.
      await incrementRetry(db, entry);
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

async function countQueue(): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function incrementRetry(
  db: IDBDatabase,
  entry: EvidenceQueueEntry,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx
      .objectStore(STORE)
      .put({ ...entry, retryCount: entry.retryCount + 1 });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
