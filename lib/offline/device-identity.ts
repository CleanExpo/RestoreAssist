/**
 * RA-7877 — the device remembers who last signed in online, for a short time,
 * so the offline page can open a cold start with no signal.
 *
 * This is a restriction, never a grant. The copy holds no credential and no
 * session. It only decides whether this device may START capturing offline,
 * and for whom. Every queued item is replayed through fetchOfflineReplay():
 * the server compares the saved owner with the live session on that very
 * request (proxy.ts -> guardOfflineReplay) and refuses a mismatch, so a
 * changed or forged copy cannot reach another account's data.
 *
 * Lifetime rules:
 *   - written only after the server has verified the owner (refreshOfflineOwner)
 *   - wiped on sign-out and sign-in as someone else (endOfflineSession), and when
 *     the server definitely says there is no such session (401). NOT wiped by a
 *     failed or offline refresh: that is exactly when the copy is needed
 *   - expires after DEVICE_IDENTITY_TTL_MS; an expired copy is refused and
 *     removed. Expiry gates STARTING a capture only: work already queued is
 *     never deleted because the copy expired.
 */
import { parseOfflineOwner, type OfflineOwner } from "./ownership";

/** Short by design: a lost phone stops opening offline capture after this. */
export const DEVICE_IDENTITY_TTL_MS = 12 * 60 * 60 * 1000;

const DB_NAME = "ra-offline-identity";
const DB_VERSION = 1;
const STORE = "identity";
const KEY = "device";

export interface DeviceIdentity {
  owner: OfflineOwner;
  /** ISO time the server last verified this owner. */
  verifiedAt: string;
  /** ISO time after which the copy is refused. */
  expiresAt: string;
}

/** Pure: the only expiry rule. A missing or malformed copy is unusable. */
export function usableDeviceIdentity(value: unknown, now = Date.now()): DeviceIdentity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const owner = parseOfflineOwner(row.owner);
  if (!owner || typeof row.verifiedAt !== "string" || typeof row.expiresAt !== "string") return null;
  const expires = Date.parse(row.expiresAt);
  const verified = Date.parse(row.verifiedAt);
  if (!Number.isFinite(expires) || !Number.isFinite(verified)) return null;
  // A copy dated in the future, or living longer than the rule allows, was not
  // written by this module.
  if (verified > now + 60_000 || expires - verified > DEVICE_IDENTITY_TTL_MS) return null;
  if (expires <= now) return null;
  return { owner, verifiedAt: row.verifiedAt, expiresAt: row.expiresAt };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

// Writes and wipes run in call order, so "verify then sign out" can never leave
// the verified copy behind.
let chain: Promise<unknown> = Promise.resolve();
function inOrder<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(job, job);
  chain = next.catch(() => undefined);
  return next;
}

export function rememberDeviceIdentity(owner: OfflineOwner, now = Date.now()): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  const value = {
    key: KEY,
    owner,
    verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEVICE_IDENTITY_TTL_MS).toISOString(),
  };
  return inOrder(() => run("readwrite", (s) => s.put(value))).then(() => undefined, () => undefined);
}

export function forgetDeviceIdentity(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return inOrder(() => run("readwrite", (s) => s.delete(KEY))).then(() => undefined, () => undefined);
}

/** Returns the usable copy, or null. An expired or malformed copy is removed. */
export async function loadDeviceIdentity(now = Date.now()): Promise<DeviceIdentity | null> {
  if (typeof indexedDB === "undefined") return null;
  let stored: unknown;
  try {
    stored = await inOrder(() => run("readonly", (s) => s.get(KEY)));
  } catch {
    return null;
  }
  const usable = usableDeviceIdentity(stored, now);
  if (!usable && stored !== undefined) await forgetDeviceIdentity();
  return usable;
}

/**
 * Online only: ask the server who is signed in, and make the device copy say
 * exactly that. A 401 is definite (signed out or expired elsewhere): the copy is
 * removed. A named owner replaces whatever was stored, so a copy left by another
 * account can never be shown to this one. Any other outcome, including no
 * network, proves nothing and leaves the copy alone.
 */
export async function confirmDeviceIdentityOnline(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    const response = await fetch("/api/auth/offline-context", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) {
      await forgetDeviceIdentity();
      return;
    }
    if (!response.ok) return;
    const owner = parseOfflineOwner((await response.json().catch(() => null))?.owner);
    if (owner) await rememberDeviceIdentity(owner);
  } catch {
    /* offline or unreachable: keep the copy */
  }
}
