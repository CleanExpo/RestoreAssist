/**
 * Voice Note Queue — RA-1609
 *
 * IndexedDB-backed offline queue for voice-note audio blobs.
 *
 * When a technician records a voice note while offline the audio blob is
 * stored here. On reconnect the drain step calls
 * /api/ai/voice-note-transcribe for each pending entry and writes the
 * resulting transcript back to the same entry as { status: "transcribed" }.
 *
 * Callers retrieve completed transcripts via getPendingTranscripts() and
 * consume them with markTranscriptConsumed().
 *
 * BROWSER ONLY — uses IndexedDB. All public functions guard against SSR.
 */

const DB_NAME = "ra-voice-note-queue";
const DB_VERSION = 1;
const STORE = "notes";

const MAX_QUEUE_SIZE = 20;
const MAX_RETRY_COUNT = 3;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type VoiceNoteStatus =
  | "pending"        // audio queued, not yet transcribed
  | "transcribing"   // in-flight — used to prevent double-drain
  | "transcribed"    // transcript ready, waiting to be consumed
  | "consumed"       // transcript delivered to caller; safe to prune
  | "failed";        // max retries reached

export interface VoiceNoteQueueEntry {
  id: string;
  /** Optional context for the consuming component to match on remount */
  inspectionId?: string;
  /** Arbitrary label so the user knows what field this was for */
  fieldLabel?: string;
  blob: Blob;
  mimeType: string;
  queuedAt: string;
  retryCount: number;
  status: VoiceNoteStatus;
  transcript?: string;
  transcribedAt?: string;
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
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("inspectionId", "inspectionId", { unique: false });
        store.createIndex("status", "status", { unique: false });
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
  return `vn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Queue an audio blob for transcription when connectivity returns.
 * Returns the entry id.
 */
export async function queueVoiceNote(input: {
  blob: Blob;
  mimeType: string;
  inspectionId?: string;
  fieldLabel?: string;
}): Promise<string> {
  const db = await openDatabase();

  const count = await countByStatus(db, ["pending", "transcribing"]);
  if (count >= MAX_QUEUE_SIZE) {
    throw new Error(
      `Voice note queue full (${MAX_QUEUE_SIZE}) — sync before recording more`,
    );
  }

  const entry: VoiceNoteQueueEntry = {
    id: generateId(),
    inspectionId: input.inspectionId,
    fieldLabel: input.fieldLabel,
    blob: input.blob,
    mimeType: input.mimeType,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  await put(db, entry);
  return entry.id;
}

/**
 * Retrieve transcribed (unconsumed) entries, optionally filtered by inspectionId.
 */
export async function getPendingTranscripts(
  inspectionId?: string,
): Promise<VoiceNoteQueueEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await openDatabase();
    const all = await listAll(db);
    return all.filter(
      (e) =>
        e.status === "transcribed" &&
        (inspectionId === undefined || e.inspectionId === inspectionId),
    );
  } catch {
    return [];
  }
}

/** Mark a transcribed entry as consumed so it won't be re-surfaced. */
export async function markTranscriptConsumed(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  const entry = await getById(db, id);
  if (entry) {
    await put(db, { ...entry, status: "consumed" });
  }
}

/** Count pending voice notes for the sync badge. */
export async function getQueuedVoiceNoteCount(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await openDatabase();
    return await countByStatus(db, ["pending"]);
  } catch {
    return 0;
  }
}

/**
 * Drain the queue — transcribe all pending entries.
 * Returns the number of entries successfully transcribed.
 * Called by nir-offline-provider on reconnect.
 */
export async function drainVoiceNoteQueue(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return 0;
  }

  const pending = (await listAll(db)).filter((e) => e.status === "pending");
  let transcribed = 0;

  for (const entry of pending) {
    if (entry.retryCount >= MAX_RETRY_COUNT) {
      await put(db, { ...entry, status: "failed" });
      continue;
    }

    // Mark in-flight so a concurrent drain doesn't double-process
    await put(db, { ...entry, status: "transcribing" });

    try {
      const form = new FormData();
      form.append(
        "audio",
        new File([entry.blob], `voice-note.webm`, { type: entry.mimeType }),
      );

      const res = await fetch("/api/ai/voice-note-transcribe", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });

      if (res.ok) {
        const data = (await res.json()) as { transcript?: string };
        const transcript = data.transcript?.trim() ?? "";
        await put(db, {
          ...entry,
          status: "transcribed",
          transcript,
          transcribedAt: new Date().toISOString(),
        });
        transcribed++;
      } else if (res.status === 401 || res.status === 503) {
        // No auth or no API key — give up (no point retrying)
        await put(db, { ...entry, status: "failed" });
      } else {
        await put(db, {
          ...entry,
          status: "pending",
          retryCount: entry.retryCount + 1,
        });
      }
    } catch {
      // Network still intermittent — revert to pending for next reconnect
      await put(db, {
        ...entry,
        status: "pending",
        retryCount: entry.retryCount + 1,
      });
    }
  }

  return transcribed;
}

/**
 * Prune consumed + failed entries older than 7 days to avoid IndexedDB bloat.
 * Call once per session from nir-offline-provider.
 */
export async function pruneVoiceNoteQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openDatabase();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const all = await listAll(db);
    await Promise.all(
      all
        .filter(
          (e) =>
            (e.status === "consumed" || e.status === "failed") &&
            e.queuedAt < cutoff,
        )
        .map((e) => remove(db, e.id)),
    );
  } catch {
    // Non-critical — ignore
  }
}

/**
 * Initialise reconnect listener. Returns cleanup fn for useEffect.
 */
export function initVoiceNoteSyncOnReconnect(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    drainVoiceNoteQueue().catch((err) =>
      console.warn("[VoiceNoteQueue] Drain failed:", err),
    );
  };

  window.addEventListener("online", handler);
  if (navigator.onLine) handler();

  return () => window.removeEventListener("online", handler);
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function listAll(db: IDBDatabase): Promise<VoiceNoteQueueEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll() as IDBRequest<VoiceNoteQueueEntry[]>;
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getById(db: IDBDatabase, id: string): Promise<VoiceNoteQueueEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id) as IDBRequest<VoiceNoteQueueEntry>;
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

function put(db: IDBDatabase, entry: VoiceNoteQueueEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function remove(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function countByStatus(
  db: IDBDatabase,
  statuses: VoiceNoteStatus[],
): Promise<number> {
  return listAll(db).then(
    (all) => all.filter((e) => statuses.includes(e.status)).length,
  );
}
