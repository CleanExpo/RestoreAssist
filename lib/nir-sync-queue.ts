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
const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]; // exponential backoff

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | "SYNCED"
  | "PENDING_SYNC"
  | "SYNC_CONFLICT"
  | "OFFLINE";

export type QueueEntryType =
  | "inspection-create"
  | "inspection-update"
  | "inspection-submit"
  | "moisture-reading"
  | "photo-upload"
  | "environmental-data"
  | "scope-item";

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
          .then((sw) => ((sw as any).sync as any).register("nir-inspection-sync"))
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
 * Drain the sync queue — call all pending entries against the server.
 * Called automatically on the 'online' event and by the service worker
 * Background Sync handler.
 *
 * @returns number of entries successfully synced
 */
export async function drainQueue(): Promise<number> {
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
    if (entry.retryCount >= MAX_RETRY_COUNT) {
      await markEntryFailed(db, entry.id);
      continue;
    }

    try {
      const response = await fetch(entry.endpoint, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });

      if (response.ok) {
        await removeEntry(db, entry.id);
        syncedCount++;
      } else if (response.status === 409) {
        // Conflict — store for manual resolution
        const serverPayload = await response.json().catch(() => null);
        await storeConflict(db, entry, serverPayload);
        await removeEntry(db, entry.id);
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
