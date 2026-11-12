/**
 * RA-7091 — Offline-first RoomPlan capture custody.
 *
 * Persists the canonical CapturedRoom JSON on-device immediately after a
 * native scan succeeds, BEFORE Fabric ingest / sketch save. That way a
 * crash or offline gap cannot lose the only copy of the LiDAR geometry.
 *
 * Integrity: SHA-256 is computed over UTF-8 bytes of stable JSON for the
 * CapturedRoom payload — never over a Data URL string. The editor also POSTs
 * the same payload to `/api/inspections/.../roomplan-custody` so the server
 * persists a receipt whose hash is over the exact stored bytes (RA-7090
 * bridge). That receipt has its own state (`serverReceipt`), separate from the
 * canvas `status`: `flushRoomPlanServerReceipts` sends every entry not yet
 * `sent` right after a scan, when the sketch loads and when the browser comes
 * back online, until the server accepts it (2xx) or refuses it for good
 * (`rejected`, RA-8325). Ed25519 tamper-evident claims still require a signed
 * EvidenceItem; this queue alone is custody-of-bytes.
 *
 * Browser-only (IndexedDB). Tests inject an in-memory store.
 */

import type { CapturedRoom } from "./roomplan-to-fabric";

const DB_NAME = "roomplan-custody";
const DB_VERSION = 1;
const STORE = "captures";

export type RoomPlanCustodyStatus =
  | "pending_ingest"
  | "ingested"
  | "failed";

/**
 * Server custody receipt state (RA-8325), independent of the canvas `status`.
 * Entries written before RA-8325 have no value and are treated as `pending`;
 * the route answers a repeat with its existing receipt, so a resend is safe.
 */
export type RoomPlanServerReceiptState = "pending" | "sent" | "rejected";

export interface RoomPlanCustodyEntry {
  id: string;
  inspectionId: string;
  floorNumber: number;
  /** Canonical CapturedRoom JSON from the native plugin. */
  capturedRoom: CapturedRoom;
  /** SHA-256 hex of UTF-8 stable JSON bytes (not a Data URL). */
  contentSha256: string;
  capturedAt: string;
  status: RoomPlanCustodyStatus;
  lastError?: string;
  serverReceipt?: RoomPlanServerReceiptState;
  /** Server message when `serverReceipt` is `rejected`. */
  serverReceiptError?: string;
}

export interface RoomPlanCustodyStore {
  put(entry: RoomPlanCustodyEntry): Promise<void>;
  get(id: string): Promise<RoomPlanCustodyEntry | null>;
  listByInspection(inspectionId: string): Promise<RoomPlanCustodyEntry[]>;
  update(
    id: string,
    patch: Partial<
      Pick<
        RoomPlanCustodyEntry,
        | "status"
        | "lastError"
        | "capturedRoom"
        | "serverReceipt"
        | "serverReceiptError"
      >
    >,
  ): Promise<void>;
  delete(id: string): Promise<void>;
}

// ─── Stable JSON + hash ───────────────────────────────────────────────────────

/** Deterministic key order so the same CapturedRoom always hashes the same. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

export async function hashCapturedRoomJson(
  capturedRoom: CapturedRoom,
): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(capturedRoom));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── In-memory store (tests) ──────────────────────────────────────────────────

export function createMemoryRoomPlanCustodyStore(): RoomPlanCustodyStore {
  const map = new Map<string, RoomPlanCustodyEntry>();
  return {
    async put(entry) {
      map.set(entry.id, structuredClone(entry));
    },
    async get(id) {
      const v = map.get(id);
      return v ? structuredClone(v) : null;
    },
    async listByInspection(inspectionId) {
      return [...map.values()]
        .filter((e) => e.inspectionId === inspectionId)
        .map((e) => structuredClone(e))
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    },
    async update(id, patch) {
      const cur = map.get(id);
      if (!cur) return;
      map.set(id, { ...cur, ...patch });
    },
    async delete(id) {
      map.delete(id);
    },
  };
}

// ─── IndexedDB store (browser) ────────────────────────────────────────────────

let _db: IDBDatabase | null = null;
let _storeOverride: RoomPlanCustodyStore | null = null;

/** @internal test seam */
export function __setRoomPlanCustodyStoreForTests(
  store: RoomPlanCustodyStore | null,
): void {
  _storeOverride = store;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("inspectionId", "inspectionId", { unique: false });
        os.createIndex("status", "status", { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

function idbStore(): RoomPlanCustodyStore {
  return {
    async put(entry) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IDB put failed"));
      });
    },
    async get(id) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () =>
          resolve((req.result as RoomPlanCustodyEntry | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
      });
    },
    async listByInspection(inspectionId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const idx = tx.objectStore(STORE).index("inspectionId");
        const req = idx.getAll(inspectionId);
        req.onsuccess = () => {
          const rows = (req.result as RoomPlanCustodyEntry[]) ?? [];
          resolve(rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)));
        };
        req.onerror = () => reject(req.error ?? new Error("IDB list failed"));
      });
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return;
      await this.put({ ...cur, ...patch });
    },
    async delete(id) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IDB delete failed"));
      });
    },
  };
}

function getStore(): RoomPlanCustodyStore {
  if (_storeOverride) return _storeOverride;
  if (typeof window === "undefined") {
    throw new Error("RoomPlan custody queue is browser-only");
  }
  return idbStore();
}

// ─── Public API ───────────────────────────────────────────────────────────────

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Persist a CapturedRoom immediately after native scan succeeds.
 * Returns the custody entry (including contentSha256).
 */
export async function enqueueRoomPlanCapture(opts: {
  inspectionId: string;
  floorNumber: number;
  capturedRoom: CapturedRoom;
}): Promise<RoomPlanCustodyEntry> {
  const contentSha256 = await hashCapturedRoomJson(opts.capturedRoom);
  const entry: RoomPlanCustodyEntry = {
    id: newId(),
    inspectionId: opts.inspectionId,
    floorNumber: opts.floorNumber,
    capturedRoom: opts.capturedRoom,
    contentSha256,
    capturedAt: new Date().toISOString(),
    status: "pending_ingest",
    serverReceipt: "pending",
  };
  await getStore().put(entry);
  return entry;
}

export async function markRoomPlanCaptureIngested(id: string): Promise<void> {
  await getStore().update(id, { status: "ingested", lastError: undefined });
}

export async function markRoomPlanCaptureFailed(
  id: string,
  error: string,
): Promise<void> {
  await getStore().update(id, { status: "failed", lastError: error });
}

export async function listPendingRoomPlanCaptures(
  inspectionId: string,
): Promise<RoomPlanCustodyEntry[]> {
  const all = await getStore().listByInspection(inspectionId);
  return all.filter((e) => e.status === "pending_ingest" || e.status === "failed");
}

export async function getRoomPlanCapture(
  id: string,
): Promise<RoomPlanCustodyEntry | null> {
  return getStore().get(id);
}

/**
 * Verify a custody entry still matches its recorded hash (detect local tamper
 * / bit-rot before re-ingest). Returns false if missing or mismatch.
 */
export async function verifyRoomPlanCustodyIntegrity(
  id: string,
): Promise<boolean> {
  const entry = await getStore().get(id);
  if (!entry) return false;
  const digest = await hashCapturedRoomJson(entry.capturedRoom);
  return digest === entry.contentSha256;
}

// ─── Server receipt replay (RA-8325) ──────────────────────────────────────────

/**
 * 4xx answers that can succeed on a later attempt: expired session, timeout,
 * too early, rate limit. Every other 4xx (for example a hash mismatch) will
 * never succeed and is marked `rejected` so it is not retried forever.
 */
const RETRYABLE_4XX = new Set([401, 408, 425, 429]);

export interface RoomPlanReceiptFlushResult {
  sent: number;
  /** Entries the server refused for good during this flush. */
  rejected: Array<{ id: string; message: string }>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const _flushChains = new Map<string, Promise<unknown>>();

async function readServerMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // Non-JSON body — fall through to the status line.
  }
  return `Server refused the receipt (HTTP ${res.status})`;
}

async function runReceiptFlush(
  inspectionId: string,
  fetchImpl: FetchLike,
): Promise<RoomPlanReceiptFlushResult> {
  const result: RoomPlanReceiptFlushResult = { sent: 0, rejected: [] };
  const store = getStore();
  const entries = (await store.listByInspection(inspectionId)).filter(
    (e) => e.serverReceipt !== "sent" && e.serverReceipt !== "rejected",
  );
  for (const entry of entries) {
    let res: Response;
    try {
      res = await fetchImpl(
        `/api/inspections/${encodeURIComponent(inspectionId)}/roomplan-custody`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capturedRoom: entry.capturedRoom,
            clientSha256: entry.contentSha256,
            clientCustodyId: entry.id,
            floorNumber: entry.floorNumber,
          }),
        },
      );
    } catch {
      // Offline or network drop: stay pending; the next load or `online`
      // event sends it. Later entries would fail the same way.
      break;
    }
    if (res.ok) {
      await store.update(entry.id, {
        serverReceipt: "sent",
        serverReceiptError: undefined,
      });
      result.sent++;
      continue;
    }
    if (res.status >= 400 && res.status < 500 && !RETRYABLE_4XX.has(res.status)) {
      const message = await readServerMessage(res);
      await store.update(entry.id, {
        serverReceipt: "rejected",
        serverReceiptError: message,
      });
      result.rejected.push({ id: entry.id, message });
      continue;
    }
    // 5xx or a retryable 4xx: leave pending for the next trigger.
  }
  return result;
}

/**
 * Send the server custody receipt for every entry of this inspection whose
 * receipt is not yet `sent` or `rejected`. A 2xx (including the route's
 * duplicate answer) marks it `sent`; a permanent 4xx marks it `rejected` with
 * the server message; anything else leaves it `pending`.
 *
 * Calls for the same inspection run one after another, so a load and an
 * `online` event that fire together cannot send the same receipt twice.
 */
export function flushRoomPlanServerReceipts(
  inspectionId: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<RoomPlanReceiptFlushResult> {
  const previous = _flushChains.get(inspectionId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => runReceiptFlush(inspectionId, fetchImpl));
  _flushChains.set(inspectionId, run);
  void run
    .catch(() => undefined)
    .then(() => {
      if (_flushChains.get(inspectionId) === run) {
        _flushChains.delete(inspectionId);
      }
    });
  return run;
}
