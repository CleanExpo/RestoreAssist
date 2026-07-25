"use client";

/**
 * RA-7090 slice 2: per-device Ed25519 manifest signing.
 *
 * Key lifecycle:
 *   1. First use on a device: generate an Ed25519 keypair via WebCrypto with
 *      a NON-EXTRACTABLE private key, persist the CryptoKey object itself in
 *      IndexedDB (structured clone keeps it non-extractable — the raw seed
 *      never exists in JavaScript-readable memory).
 *   2. Register the public key (SPKI PEM) + derived key id with
 *      POST /api/devices/signing-key. Registration is idempotent for the
 *      same user + key.
 *   3. Every guided capture signs a canonical JSON manifest; the server
 *      verifies against the registered, non-revoked key.
 *
 * The key id is the first 16 hex chars of SHA-256 over the SPKI public-key
 * bytes — deterministic from the key material, so a re-register of the same
 * key can never mint a second id.
 */

import {
  canonicalizeManifest,
  type SignedEvidenceManifest,
} from "./manifest-canonical";
import type { IOSCaptureResult } from "./ios-capture";

const DB_NAME = "ra-device-signing";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const RECORD_KEY = "device-key-v1";

export interface DeviceKeyRecord {
  /** DeviceSigningKey.publicKeyId — first 16 hex chars of SHA-256(SPKI). */
  keyId: string;
  /** Non-extractable Ed25519 private key. */
  privateKey: CryptoKey;
  /** SPKI PEM of the public half — what gets registered server-side. */
  publicKeyPem: string;
  createdAt: string;
  /** True once POST /api/devices/signing-key has acknowledged the key. */
  registered: boolean;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function idbGet(db: IDBDatabase): Promise<DeviceKeyRecord | undefined> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(RECORD_KEY);
    request.onsuccess = () =>
      resolve(request.result as DeviceKeyRecord | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

function idbPut(db: IDBDatabase, record: DeviceKeyRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(record, RECORD_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB write failed"));
  });
}

function idbDelete(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(RECORD_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB delete failed"));
  });
}

/**
 * Review round 1 (MUST-FIX 4): drop this device's cached key.
 * Revoking a key used to BRICK the device — the dead key stayed cached
 * forever, re-registration was refused permanently, and the technician could
 * not upload evidence at all until IndexedDB was cleared by hand.
 */
export async function forgetDeviceKey(): Promise<void> {
  const db = await openDatabase();
  try {
    await idbDelete(db);
  } finally {
    db.close();
  }
}

/** Discard the cached key and generate + persist a fresh one. */
export async function rotateDeviceKey(): Promise<DeviceKeyRecord> {
  const db = await openDatabase();
  try {
    const record = await generateDeviceKey();
    await idbPut(db, record);
    return record;
  } finally {
    db.close();
  }
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary);
}

function spkiToPem(spki: ArrayBuffer): string {
  const base64 = toBase64(spki);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

async function deriveKeyId(spki: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", spki);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Generate a fresh Ed25519 device keypair. Exported separately from the
 * IndexedDB plumbing so the crypto contract is unit-testable in Node.
 */
export async function generateDeviceKey(): Promise<DeviceKeyRecord> {
  // extractable=false: the PRIVATE key can never leave this device. The
  // public key is always exportable regardless of this flag.
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  return {
    keyId: await deriveKeyId(spki),
    privateKey: keyPair.privateKey,
    publicKeyPem: spkiToPem(spki),
    createdAt: new Date().toISOString(),
    registered: false,
  };
}

/**
 * Load this device's signing key from IndexedDB, generating and persisting
 * one on first use.
 */
export async function getOrCreateDeviceKey(): Promise<DeviceKeyRecord> {
  const db = await openDatabase();
  try {
    const existing = await idbGet(db);
    if (existing) return existing;
    const record = await generateDeviceKey();
    await idbPut(db, record);
    return record;
  } finally {
    db.close();
  }
}

/** Statuses meaning "this key is dead — rotate rather than retry it". */
const KEY_REJECTED_STATUSES = new Set([403, 409]);

async function registerKey(
  record: DeviceKeyRecord,
  devicePlatform: string,
): Promise<{ ok: true; record: DeviceKeyRecord } | { ok: false; status: number }> {
  const response = await fetch("/api/devices/signing-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKeyPem: record.publicKeyPem,
      devicePlatform,
    }),
  });
  if (!response.ok) return { ok: false, status: response.status };

  // The server DERIVES the authoritative key id from the SPKI bytes
  // (MUST-FIX 3). Adopt what it returns so client and server can never
  // disagree about which key signed a manifest.
  let serverKeyId: string | undefined;
  try {
    const body = await response.json();
    const id = body?.deviceSigningKey?.publicKeyId;
    if (typeof id === "string" && id.length > 0) serverKeyId = id;
  } catch {
    // Body is advisory; the locally derived id matches by construction.
  }

  const registered: DeviceKeyRecord = {
    ...record,
    keyId: serverKeyId ?? record.keyId,
    registered: true,
  };
  const db = await openDatabase();
  try {
    await idbPut(db, registered);
  } finally {
    db.close();
  }
  return { ok: true, record: registered };
}

/**
 * Register the device public key with the server (idempotent). Marks the
 * IndexedDB record registered on success so subsequent captures skip the
 * round-trip.
 *
 * Review round 1 (MUST-FIX 4): when the server REJECTS the key (403 revoked
 * / 409 owned elsewhere), the cached key is discarded and a fresh one is
 * generated and registered, so a revoked device recovers by itself instead
 * of being locked out of evidence capture until IndexedDB is cleared.
 */
export async function ensureDeviceKeyRegistered(
  devicePlatform: string = "capacitor",
): Promise<DeviceKeyRecord> {
  const record = await getOrCreateDeviceKey();
  if (record.registered) return record;

  const first = await registerKey(record, devicePlatform);
  if (first.ok) return first.record;

  if (KEY_REJECTED_STATUSES.has(first.status)) {
    const rotated = await rotateDeviceKey();
    const second = await registerKey(rotated, devicePlatform);
    if (second.ok) return second.record;
    throw new Error(
      `Device key registration failed after rotation (${second.status})`,
    );
  }

  throw new Error(`Device key registration failed (${first.status})`);
}

/**
 * Recover from a server-side rejection of the key we signed with (evidence
 * POST returned 403). Discards the dead key and registers a fresh one;
 * returns null when recovery itself fails so the caller can fall back to an
 * unsigned submission rather than blocking the technician.
 */
export async function recoverFromRejectedKey(
  devicePlatform: string = "capacitor",
): Promise<DeviceKeyRecord | null> {
  try {
    const rotated = await rotateDeviceKey();
    const result = await registerKey(rotated, devicePlatform);
    return result.ok ? result.record : null;
  } catch {
    return null;
  }
}

/** Sign a manifest's canonical bytes; returns base64 Ed25519 signature. */
export async function signManifest(
  privateKey: CryptoKey,
  manifest: SignedEvidenceManifest,
): Promise<string> {
  const canonical = canonicalizeManifest(manifest);
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(canonical),
  );
  return toBase64(signature);
}

export interface SignedManifestPayload {
  manifest: SignedEvidenceManifest;
  /** Canonical JSON string — the EXACT bytes that were signed. */
  manifestJson: string;
  /** Base64 Ed25519 signature over manifestJson. */
  signature: string;
  deviceKeyId: string;
}

/**
 * Build and sign the capture manifest for a guided-capture submission.
 * The manifest binds the byte hash to WHO captured WHAT, WHERE, WHEN and
 * on WHICH device key — the server refuses it unless every field checks out.
 */
export async function createSignedManifest(
  capture: IOSCaptureResult,
  context: {
    inspectionId: string;
    workflowStepId: string | null;
    evidenceClass: string;
    userId: string;
  },
  key: DeviceKeyRecord,
): Promise<SignedManifestPayload> {
  const manifest: SignedEvidenceManifest = {
    inspectionId: context.inspectionId,
    workflowStepId: context.workflowStepId,
    evidenceClass: context.evidenceClass,
    capturedAt: capture.manifest.capturedAt,
    gps: {
      lat: capture.manifest.lat,
      lng: capture.manifest.lng,
      accuracy: capture.manifest.accuracy,
    },
    userId: context.userId,
    deviceKeyId: key.keyId,
    sha256: capture.manifest.sha256,
  };
  const signature = await signManifest(key.privateKey, manifest);
  return {
    manifest,
    manifestJson: canonicalizeManifest(manifest),
    signature,
    deviceKeyId: key.keyId,
  };
}
