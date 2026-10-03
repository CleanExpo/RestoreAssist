/**
 * Voice Note Queue — RA-1609 (sequel to RA-1124)
 *
 * IndexedDB-backed offline queue for voice-note audio blobs.
 *
 * Scope: when a technician records a voice note while offline (or the
 * transcribe call fails with a network error / 503), the audio blob is
 * stored locally together with the field context (inspectionId +
 * fieldLabel, and the room id when the note was recorded on a room).
 * When connectivity returns (online event or SW Background
 * Sync with tag "voice-note-sync"), the queue drains against the existing
 * POST /api/ai/voice-note-transcribe endpoint and keeps the resulting
 * transcript (or a terminal error) for the caller to consume.
 *
 * BROWSER ONLY — uses IndexedDB. All public functions guard against SSR.
 *
 * Sibling to lib/evidence-upload-queue.ts — same DB/store/version idiom,
 * kept as a separate DB because the payload (single audio blob + field
 * context, no multipart location) and drain target differ.
 */

import { getOfflineOwner, requireOfflineOwner, ownsOfflineEntry, fetchOfflineReplay, withOfflineDrainLock, type OfflineOwner } from "@/lib/offline/account-boundary";
import { notifySyncQueueChanged } from "@/lib/offline/sync-status-event";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DB_NAME = "ra-voice-note-queue";
const DB_VERSION = 1;
const STORE = "notes";

/** Cap queue size to avoid IndexedDB blowout on a long offline session. */
const MAX_QUEUE_SIZE = 50;

const MAX_RETRY_COUNT = 5;

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Fired after a drain attempt so open voice-note controls can read transcripts. */
export const VOICE_NOTES_DRAINED_EVENT = "ra-voice-notes-drained";

export type VoiceNoteQueueStatus = "pending" | "done" | "error" | "consumed";

export interface VoiceNoteQueueEntry {
  owner?: OfflineOwner;
  /** Stable client-side id */
  id: string;
  inspectionId: string;
  fieldLabel: string;
  /** Room the note was recorded against. Absent on older queue rows. */
  roomId?: string;
  blob: Blob;
  mimeType: string;
  /** ISO timestamp when queued */
  queuedAt: string;
  retryCount: number;
  status: VoiceNoteQueueStatus;
  /** Set once drain succeeds */
  transcript?: string;
  /** Set when drain hits a terminal, non-retryable error (e.g. 402/413/415) */
  error?: string;
}

export interface PendingTranscript {
  id: string;
  inspectionId: string;
  fieldLabel: string;
  /** Room the note was recorded against, when the queue row has one. */
  roomId?: string;
  status: "done" | "error";
  transcript?: string;
  error?: string;
  queuedAt: string;
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
  return `vn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Both `{ error: string }` and `{ error: { message } }` response shapes exist on this route. */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) {
      const message = (err as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return fallback;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Queue a voice-note audio blob for transcription when connectivity returns.
 * Returns the entry id.
 *
 * Throws if the queue is already at MAX_QUEUE_SIZE — the caller should
 * surface an error to the technician to free up space before recording more.
 */
export async function queueVoiceNote(
  blob: Blob,
  context: { inspectionId: string; fieldLabel: string; roomId?: string },
): Promise<string> {
  const owner = requireOfflineOwner();
  const db = await openDatabase();

  const count = await countQueue();
  if (count >= MAX_QUEUE_SIZE) {
    throw new Error(
      `Voice note queue full (${MAX_QUEUE_SIZE}) — sync pending notes before recording more`,
    );
  }

  if (!ownsOfflineEntry({ owner })) throw new Error("Offline account changed; recording was not overwritten");
  const entry: VoiceNoteQueueEntry = {
    owner,
    id: generateId(),
    inspectionId: context.inspectionId,
    fieldLabel: context.fieldLabel,
    ...(context.roomId ? { roomId: context.roomId } : {}),
    blob,
    mimeType: blob.type || "audio/webm",
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(entry);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Recording was not saved"));
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
        ).sync.register("voice-note-sync"),
      )
      .catch(() => {
        /* SW not yet active, online event will still drain */
      });
  }

  return entry.id;
}

/** Count unresolved voice notes (queued, transcribed, or errored) — drives the "N pending" badge. */
export async function getQueuedVoiceNoteCount(strict = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await openDatabase();
    const entries = await listAll(db);
    return entries.filter((e) => ownsOfflineEntry(e) && e.status !== "consumed").length;
  } catch (error) {
    if (strict) throw error;
    return 0;
  }
}

/**
 * Transcribed (or terminally-errored) entries ready for the UI to attach to
 * their field / surface to the technician.
 */
export async function getPendingTranscripts(): Promise<PendingTranscript[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await openDatabase();
    const entries = await listAll(db);
    return entries
      .filter(
        (e): e is VoiceNoteQueueEntry & { status: "done" | "error" } =>
          ownsOfflineEntry(e) && (e.status === "done" || e.status === "error"),
      )
      .map((e) => ({
        id: e.id,
        inspectionId: e.inspectionId,
        fieldLabel: e.fieldLabel,
        ...(e.roomId ? { roomId: e.roomId } : {}),
        status: e.status,
        transcript: e.transcript,
        error: e.error,
        queuedAt: e.queuedAt,
      }));
  } catch {
    return [];
  }
}

/** Only a delivered, nonempty transcript may be consumed and pruned. */
export async function markTranscriptConsumed(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  const entry = await getEntry(db, id);
  if (!entry || !ownsOfflineEntry(entry) || entry.status !== "done" || !entry.transcript?.trim()) return;
  await putEntry(db, { ...entry, status: "consumed" });
}

/**
 * Drop only explicitly consumed entries belonging to the current account.
 * Legacy rows and unconsumed recordings are preserved regardless of age.
 * Returns the number of entries removed.
 */
export async function pruneVoiceNoteQueue(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await openDatabase();
    const entries = await listAll(db);
    let pruned = 0;

    for (const entry of entries) {
      const isConsumed = entry.status === "consumed";
      if (ownsOfflineEntry(entry) && isConsumed) {
        await removeEntry(db, entry.id);
        pruned++;
      }
    }

    return pruned;
  } catch {
    return 0;
  }
}

/**
 * Drain the voice-note queue against POST /api/ai/voice-note-transcribe.
 * Called by the reconnect listener and by the SW Background Sync handler
 * (via postMessage → client).
 *
 * Returns the number of notes successfully transcribed.
 */
export async function drainVoiceNoteQueue(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine || !getOfflineOwner()) return 0;
  return withOfflineDrainLock("ra-voice-note-drain", drainVoiceNoteQueueImpl);
}

async function drainVoiceNoteQueueImpl(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return 0;
  }

  const entries = await listAll(db);
  let transcribed = 0;

  for (const entry of entries) {
    if (!ownsOfflineEntry(entry) || entry.status !== "pending") continue;

    if (entry.retryCount >= MAX_RETRY_COUNT) {
      await putEntry(db, {
        ...entry,
        status: "error",
        error: "Transcription failed after repeated retries",
      });
      continue;
    }

    try {
      const form = new FormData();
      form.append(
        "audio",
        new File([entry.blob], "voice-note.webm", { type: entry.mimeType }),
      );

      const response = await fetchOfflineReplay(entry.owner, "/api/ai/voice-note-transcribe", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      }, () => putEntry(db, {
        ...entry,
        status: "error",
        error: "Transcription delivery is unconfirmed. The recording is preserved; automatic replay is paused to avoid duplicate charges.",
      }));

      if (!response) break;
      if (response.ok) {
        const data = (await response.json()) as { transcript?: unknown };
        if (typeof data.transcript !== "string" || !data.transcript.trim()) continue;
        await putEntry(db, {
          ...entry,
          status: "done",
          transcript: data.transcript.trim(),
        });
        transcribed++;
        continue;
      }

      if ([400, 401, 402, 413, 415].includes(response.status)) {
        // Terminal for this entry — retrying won't change the outcome
        // (bad payload, expired auth, no active sub / no workspace key,
        // file too large, unsupported type). Surface, don't silently drop.
        const body = await response.json().catch(() => ({}));
        await putEntry(db, {
          ...entry,
          status: "error",
          error: extractErrorMessage(body, `HTTP ${response.status}`),
        });
        continue;
      }

      // An unexpected HTTP response may follow successful provider dispatch.
      // Retain the pre-send unconfirmed marker instead of paying twice.
    } catch {
      // The provider may have accepted the request before the connection died.
      // Keep the unconfirmed marker and audio; never automatically pay twice.
    }
  }

  window.dispatchEvent(new CustomEvent(VOICE_NOTES_DRAINED_EVENT));
  return transcribed;
}

/**
 * Initialise the reconnect listener. Call once from the root offline provider.
 * Returns a cleanup function for useEffect.
 */
export function initVoiceNoteSyncOnReconnect(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    drainVoiceNoteQueue().catch((err) =>
      console.warn("[VoiceNote] Queue drain failed:", err),
    );
  };

  window.addEventListener("online", handler);

  // Listen for Background Sync messages from the service worker.
  const swMessageHandler = (event: MessageEvent) => {
    if (
      event.data?.type === "NIR_SYNC_TRIGGER" &&
      event.data?.tag === "voice-note-sync"
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

function listAll(db: IDBDatabase): Promise<VoiceNoteQueueEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll() as IDBRequest<
      VoiceNoteQueueEntry[]
    >;
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getEntry(
  db: IDBDatabase,
  id: string,
): Promise<VoiceNoteQueueEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id) as IDBRequest<
      VoiceNoteQueueEntry | undefined
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
    tx.onabort = () => reject(tx.error ?? new Error("Queue update was not saved"));
  });
}

function putEntry(db: IDBDatabase, entry: VoiceNoteQueueEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(entry);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => { notifySyncQueueChanged(); resolve(); };
    tx.onabort = () => reject(tx.error ?? new Error("Queue update was not saved"));
  });
}
