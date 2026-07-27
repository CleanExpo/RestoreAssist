/**
 * RA-7091 — Offline-first RoomPlan capture custody.
 *
 * Persists the canonical CapturedRoom JSON on-device immediately after a
 * native scan succeeds, BEFORE Fabric ingest / sketch save. That way a
 * crash or offline gap cannot lose the only copy of the LiDAR geometry.
 *
 * Integrity: SHA-256 is computed over UTF-8 bytes of stable JSON for the
 * CapturedRoom payload — never over a Data URL string. Stronger
 * tamper-evident claims still wait on RA-7090 for uploaded stored bytes.
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
}

export interface RoomPlanCustodyStore {
  put(entry: RoomPlanCustodyEntry): Promise<void>;
  get(id: string): Promise<RoomPlanCustodyEntry | null>;
  listByInspection(inspectionId: string): Promise<RoomPlanCustodyEntry[]>;
  update(
    id: string,
    patch: Partial<
      Pick<RoomPlanCustodyEntry, "status" | "lastError" | "capturedRoom">
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
