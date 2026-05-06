/**
 * NIR Sync Queue — IndexedDB-Backed Offline Write Queue
 *
 * Implements the offline-first sync requirement from nir-field-reality-spec.ts:
 *   OFFLINE_REQUIREMENTS.fullOfflineCapability
 *   OFFLINE_REQUIREMENTS.syncStatusIndicator
 *
 * Architecture:
 *   - Writes are queued in IndexedDB when offline or when an API call fails
 *   - Queue is drained automatically on reconnect via the 'online' event
 *   - Background Sync API used as primary drain trigger (Chromium)
 *   - 'online' event listener provides Safari/Firefox fallback
 *   - Last-write-wins conflict resolution for non-conflicting fields
 *
 * BROWSER ONLY: This module uses IndexedDB and is not compatible with
 * Node.js server-side rendering. All public functions guard against SSR.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DB_NAME = "nir-offline-queue";
const DB_VERSION = 1;
const QUEUE_STORE = "sync-queue";
const CONFLICT_STORE = "sync-conflicts";

const MAX_RETRY_COUNT = 5;
// RA-1762 — sketch saves represent potentially 30+ minutes of irrecoverable
// canvas work; permanently failing them after 48s of retries (the default
// MAX_RETRY_COUNT * RETRY_BACKOFF_MS) is unacceptable. Use a much higher cap
// for sketches; per-type overrides live in `getMaxRetryCount` below.
const SKETCH_SAVE_MAX_RETRY_COUNT = 1000; // ~effectively unlimited
const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]; // exponential backoff

function getMaxRetryCount(type: QueueEntryType): number {
  if (type === "sketch-save") return SKETCH_SAVE_MAX_RETRY_COUNT;
  return MAX_RETRY_COUNT;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | "SYNCED"
  | "PENDING_SYNC"
  | "SYNC_CONFLICT"
  | "OFFLINE";

/**
 * RA-1767 — adding a new entry type does NOT require bumping NIR_VERSION
 * in `public/sw.js`. The drain runs in this file (client-side), the SW
 * only fires the NIR_SYNC_TRIGGER message. Bumping NIR_VERSION invalidates
 * the cached app shell for every offline user — see the warning at the
 * top of `public/sw.js` for the full list of when (and when not) to bump.
 */
export type QueueEntryType =
  | "inspection-create"
  | "inspection-update"
  | "inspection-submit"
  | "moisture-reading"
  | "photo-upload"
  | "environmental-data"
  | "scope-item"
  // RA-1762 — sketch canvas saves. Coalesced by (inspectionId, floorNumber)
  // at enqueue time so rapid offline edits don't blow the IDB quota.
  | "sketch-save";

/**
 * RA-1762 — payload shape for `"sketch-save"` queue entries. The
 * server endpoint (`POST /api/inspections/[id]/sketches`) already
 * upserts by `(inspectionId, floorNumber)` so the drain is idempotent.
 * `clientUpdatedAt` is sent as the `x-client-updated-at` header on
 * drain so the server can reject stale payloads (409 + `{stale:true}`)
 * that would otherwise clobber a fresher online save.
 */
export interface SketchSavePayload {
  floorNumber: number;
  floorLabel: string;
  sketchType?: string;
  sketchData?: unknown;
  backgroundImageUrl?: string | null;
  moisturePoints?: unknown;
  equipmentPoints?: unknown;
  /** Epoch ms at the moment the local sketch state was captured. */
  clientUpdatedAt: number;
}

export interface SyncQueueEntry {
  id: string;
  type: QueueEntryType;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  payload: unknown;
  inspectionId: string;
  /** ISO timestamp when this entry was queued */
  queuedAt: string;
  /** ISO timestamp of last sync attempt */
  lastAttemptAt?: string;
  retryCount: number;
  status: "pending" | "processing" | "failed";
}

export interface SyncConflict {
  id: string;
  entryId: string;
  localPayload: unknown;
  serverPayload: unknown;
  conflictedAt: string;
  resolved: boolean;
}

export interface QueueStats {
  pending: number;
  failed: number;
  conflicts: number;
  status: SyncStatus;
}

// ─── DATABASE INITIALISATION ──────────────────────────────────────────────────

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

      // Sync queue store
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        store.createIndex("by-status", "status", { unique: false });
        store.createIndex("by-inspection", "inspectionId", { unique: false });
        store.createIndex("by-type", "type", { unique: false });
      }

      // Conflict store
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflictStore = db.createObjectStore(CONFLICT_STORE, {
          keyPath: "id",
        });
        conflictStore.createIndex("by-resolved", "resolved", { unique: false });
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
  return `nir-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── QUEUE OPERATIONS ─────────────────────────────────────────────────────────

/**
 * Add an API write to the offline queue.
 * Call this when a fetch fails due to offline status, or proactively
 * when the app detects it is offline before making the request.
 */
export async function queueWrite(
  entry: Omit<SyncQueueEntry, "id" | "queuedAt" | "retryCount" | "status">,
): Promise<string> {
  const db = await openDatabase();
  const id = generateId();

  const queueEntry: SyncQueueEntry = {
    ...entry,
    id,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.add(queueEntry);
    req.onsuccess = () => {
      // Attempt Background Sync if supported (Chromium)
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready
          .then((sw) =>
            ((sw as any).sync as any).register("nir-inspection-sync"),
          )
          .catch(() => {
            /* SW not yet active, online listener will handle it */
          });
      }
      resolve(id);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * RA-1762 — sketch-specific enqueue with coalesce-by-(inspectionId, floorNumber).
 *
 * Reasoning: SketchEditorV2 autosaves on a 1.5 s debounce. With active
 * drawing while offline, that produces an entry every ~1.5 s carrying a
 * full Fabric `toJSON()` payload (often hundreds of KB). Without
 * coalescing, 10 minutes offline → ~400 entries × ~200 KB each ≈ 80 MB
 * in IDB, and Chrome will throw QuotaExceededError on `store.add()`.
 * Coalescing also matches the user's intent — they care about the
 * latest state of each floor, not the history.
 *
 * Coalesce strategy: in a single readwrite transaction, scan all
 * pending entries for this inspection via the `by-inspection` index,
 * delete any `sketch-save` entries with the same `floorNumber`, then
 * add the new entry. Atomic — no race window where the floor is
 * unrepresented.
 *
 * `endpoint` and `method` are fixed to the sketches POST route so the
 * caller can't accidentally point a sketch save at a different
 * endpoint (would silently corrupt cross-type drains).
 */
export async function enqueueSketchSave(
  inspectionId: string,
  payload: SketchSavePayload,
): Promise<string> {
  const db = await openDatabase();
  const id = generateId();

  const queueEntry: SyncQueueEntry = {
    id,
    type: "sketch-save",
    endpoint: `/api/inspections/${inspectionId}/sketches`,
    method: "POST",
    payload,
    inspectionId,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const index = store.index("by-inspection");
    const cursorReq = index.openCursor(IDBKeyRange.only(inspectionId));

    cursorReq.onsuccess = (evt) => {
      const cursor = (evt.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const existing = cursor.value as SyncQueueEntry;
        if (
          existing.type === "sketch-save" &&
          existing.status === "pending" &&
          (existing.payload as SketchSavePayload | null)?.floorNumber ===
            payload.floorNumber
        ) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        // Coalesce scan complete — add the new entry within the same tx.
        const addReq = store.add(queueEntry);
        addReq.onsuccess = () => {
          // Best-effort Background Sync registration (Chromium).
          if ("serviceWorker" in navigator && "SyncManager" in window) {
            navigator.serviceWorker.ready
              .then((sw) =>
                ((sw as any).sync as any).register("nir-inspection-sync"),
              )
              .catch(() => {
                /* SW not yet active, online listener will handle it */
              });
          }
          resolve(id);
        };
        addReq.onerror = () => reject(addReq.error);
      }
    };

    cursorReq.onerror = () => reject(cursorReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all pending entries for an inspection.
 * Used to show the technician which data is not yet synced.
 */
export async function getPendingEntries(
  inspectionId?: string,
): Promise<SyncQueueEntry[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);

    let req: IDBRequest<SyncQueueEntry[]>;

    if (inspectionId) {
      const index = store.index("by-inspection");
      req = index.getAll(inspectionId);
    } else {
      const index = store.index("by-status");
      req = index.getAll("pending");
    }

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * RA-1769 — get all `failed` entries (optionally scoped to one inspection).
 *
 * Failed entries are produced by `markEntryFailed` after `MAX_RETRY_COUNT`
 * (or `SKETCH_SAVE_MAX_RETRY_COUNT`) attempts. They will not be drained
 * automatically — the user must explicitly retry, export, or discard via
 * the recovery UI.
 */
export async function getFailedEntries(
  inspectionId?: string,
): Promise<SyncQueueEntry[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const statusIndex = store.index("by-status");
    const req = statusIndex.getAll("failed");

    req.onsuccess = () => {
      const all = req.result;
      resolve(
        inspectionId ? all.filter((e) => e.inspectionId === inspectionId) : all,
      );
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * RA-1769 — reset a failed entry to `pending` so the next drain picks it
 * up. Wipes `retryCount` and `lastAttemptAt` so the new drain starts
 * with a fresh retry budget. Returns true if the entry was found and
 * reset, false if it had already been removed (e.g. cross-tab race).
 */
export async function retryFailedEntry(id: string): Promise<boolean> {
  const db = await openDatabase();

  const entry = await new Promise<SyncQueueEntry | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const req = tx.objectStore(QUEUE_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    },
  );

  if (!entry || entry.status !== "failed") return false;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).put({
      ...entry,
      status: "pending",
      retryCount: 0,
      lastAttemptAt: undefined,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Kick the drain so the user sees their retry happen immediately
  // instead of waiting for the next 5 s polling tick.
  void drainQueue();
  return true;
}

/**
 * RA-1769 — permanently remove a failed entry. Use when the user has
 * exported the payload to file or explicitly chosen to discard. No
 * confirmation gate at this layer; the caller (UI) is responsible for
 * asking the user before invoking.
 */
export async function removeFailedEntry(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Drain the sync queue — call all pending entries against the server.
 * Called automatically on the 'online' event and by the service worker
 * Background Sync handler.
 *
 * @returns number of entries successfully synced
 */
/**
 * RA-1768 — cross-tab single-flight via navigator.locks.
 *
 * Without the lock: two tabs of the same inspection both fire `online`,
 * both call drainQueue(), both read the same pending entries from IDB,
 * both POST to the server, both attempt removeEntry. Today this works
 * by accident — every queued endpoint happens to be idempotent — but
 * that's an implicit contract no caller is aware of and will silently
 * break the moment a non-idempotent endpoint is added to the queue.
 *
 * With the lock: at most one tab drains at a time (exclusive mode).
 * Subsequent tabs queue behind the holder and drain after, by which
 * point the first tab has typically cleared the queue (the second
 * tab's drain returns 0). Lock name is namespaced so it doesn't
 * collide with any unrelated `navigator.locks` users.
 *
 * Fallback: when `navigator.locks` is unavailable (older browsers),
 * drainQueue calls drainQueueImpl directly, preserving today's
 * implicit-idempotency behaviour.
 */
const SYNC_DRAIN_LOCK_NAME = "nir-sync-drain";

export async function drainQueue(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  if (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    navigator.locks?.request
  ) {
    return navigator.locks.request(
      SYNC_DRAIN_LOCK_NAME,
      { mode: "exclusive" },
      () => drainQueueImpl(),
    );
  }

  return drainQueueImpl();
}

async function drainQueueImpl(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return 0;
  }

  const entries = await new Promise<SyncQueueEntry[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const index = store.index("by-status");
    const req = index.getAll("pending");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  let syncedCount = 0;

  for (const entry of entries) {
    // RA-1762 — per-type retry budget. Sketches use a much higher cap
    // because losing 30+ minutes of canvas work to a transient outage
    // is unacceptable; other types keep the historical 5-attempt limit.
    if (entry.retryCount >= getMaxRetryCount(entry.type)) {
      await markEntryFailed(db, entry.id);
      continue;
    }

    try {
      // RA-1762 — sketch-save entries piggyback the staleness check on
      // the `x-client-updated-at` header. Other types pass through with
      // the original Content-Type-only headers so unrelated routes
      // aren't suddenly required to read the new header.
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (entry.type === "sketch-save") {
        const sketchPayload = entry.payload as SketchSavePayload | null;
        if (sketchPayload?.clientUpdatedAt != null) {
          headers["x-client-updated-at"] = String(
            sketchPayload.clientUpdatedAt,
          );
        }
      }

      const response = await fetch(entry.endpoint, {
        method: entry.method,
        headers,
        body: JSON.stringify(entry.payload),
      });

      if (response.ok) {
        await removeEntry(db, entry.id);
        syncedCount++;
      } else if (response.status === 409) {
        // RA-1762 — a 409 with `{ stale: true }` is the server telling
        // us this queued payload predates the latest server state for
        // this resource. Drop the entry silently; storing a conflict
        // record for "you tried to save older data" would be noise the
        // user can't act on. Other 409s (true conflicts) still go to
        // the conflict store for manual resolution.
        const serverPayload: { stale?: boolean } | null = await response
          .json()
          .catch(() => null);
        if (serverPayload?.stale === true) {
          await removeEntry(db, entry.id);
        } else {
          await storeConflict(db, entry, serverPayload);
          await removeEntry(db, entry.id);
        }
      } else {
        // Retriable error
        await incrementRetry(db, entry);
      }
    } catch {
      // Network error — still offline or intermittent
      await incrementRetry(db, entry);
    }
  }

  return syncedCount;
}

/**
 * Get current sync status for display in the persistent status bar.
 * Maps to OFFLINE_REQUIREMENTS.syncStatusIndicator.states
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  if (typeof window === "undefined") return "OFFLINE";

  if (!navigator.onLine) return "OFFLINE";

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return "OFFLINE";
  }

  const [pendingCount, conflictCount] = await Promise.all([
    countByStatus(db, "pending"),
    countConflicts(db),
  ]);

  if (conflictCount > 0) return "SYNC_CONFLICT";
  if (pendingCount > 0) return "PENDING_SYNC";
  return "SYNCED";
}

/**
 * Get queue statistics for the sync status UI element.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const status = await getSyncStatus();

  if (typeof window === "undefined") {
    return { pending: 0, failed: 0, conflicts: 0, status: "OFFLINE" };
  }

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return { pending: 0, failed: 0, conflicts: 0, status: "OFFLINE" };
  }

  const [pending, failed, conflicts] = await Promise.all([
    countByStatus(db, "pending"),
    countByStatus(db, "failed"),
    countConflicts(db),
  ]);

  return { pending, failed, conflicts, status };
}

/**
 * Resolve a sync conflict using local (technician) version.
 * The server is overwritten with the local payload.
 */
export async function resolveConflictWithLocal(
  conflictId: string,
): Promise<void> {
  const db = await openDatabase();

  const conflict = await new Promise<SyncConflict | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE, "readonly");
      const req = tx.objectStore(CONFLICT_STORE).get(conflictId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    },
  );

  if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

  // Re-queue with local payload
  const entry = conflict.localPayload as SyncQueueEntry;
  await queueWrite({
    type: entry.type,
    endpoint: entry.endpoint,
    method: "PUT", // Force overwrite
    payload: entry.payload,
    inspectionId: entry.inspectionId,
  });

  // Mark conflict resolved
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, "readwrite");
    const store = tx.objectStore(CONFLICT_STORE);
    const updated = { ...conflict, resolved: true };
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

async function removeEntry(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function markEntryFailed(db: IDBDatabase, id: string): Promise<void> {
  const entry = await new Promise<SyncQueueEntry>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).put({ ...entry, status: "failed" });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function incrementRetry(
  db: IDBDatabase,
  entry: SyncQueueEntry,
): Promise<void> {
  const backoffMs =
    RETRY_BACKOFF_MS[Math.min(entry.retryCount, RETRY_BACKOFF_MS.length - 1)];
  const nextAttempt = new Date(Date.now() + backoffMs).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).put({
      ...entry,
      retryCount: entry.retryCount + 1,
      lastAttemptAt: new Date().toISOString(),
      nextAttemptAt: nextAttempt,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function storeConflict(
  db: IDBDatabase,
  entry: SyncQueueEntry,
  serverPayload: unknown,
): Promise<void> {
  const conflict: SyncConflict = {
    id: generateId(),
    entryId: entry.id,
    localPayload: entry,
    serverPayload,
    conflictedAt: new Date().toISOString(),
    resolved: false,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, "readwrite");
    const req = tx.objectStore(CONFLICT_STORE).add(conflict);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function countByStatus(db: IDBDatabase, status: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const index = tx.objectStore(QUEUE_STORE).index("by-status");
    const req = index.count(status);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function countConflicts(db: IDBDatabase): Promise<number> {
  // IDBIndex.count() requires a valid IDB key. Booleans are NOT valid IDB keys
  // and passing `false` throws DataError. Use getAll() and filter in JS instead.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, "readonly");
    const req = tx.objectStore(CONFLICT_STORE).getAll();
    req.onsuccess = () => {
      const unresolved = (req.result as SyncConflict[]).filter(
        (c) => !c.resolved,
      ).length;
      resolve(unresolved);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── ONLINE EVENT LISTENER ────────────────────────────────────────────────────

/**
 * Initialise the online event listener for automatic queue drain.
 * Call once from the root layout / offline provider.
 * Provides the Safari/Firefox fallback for Background Sync.
 */
export function initSyncOnReconnect(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    drainQueue().catch((err) =>
      console.warn("[NIR Sync] Queue drain on reconnect failed:", err),
    );
  };

  window.addEventListener("online", handler);

  // Also listen for messages from the service worker Background Sync
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "NIR_SYNC_TRIGGER") {
        handler();
      }
    });
  }

  // Drain immediately if already online and queue has entries
  if (navigator.onLine) {
    handler();
  }

  return () => window.removeEventListener("online", handler);
}
