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

/**
 * Register the device public key with the server (idempotent). Marks the
 * IndexedDB record registered on success so subsequent captures skip the
 * round-trip.
 */
export async function ensureDeviceKeyRegistered(
  devicePlatform: string = "capacitor",
): Promise<DeviceKeyRecord> {
  const record = await getOrCreateDeviceKey();
  if (record.registered) return record;

  const response = await fetch("/api/devices/signing-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKeyId: record.keyId,
      publicKeyPem: record.publicKeyPem,
      devicePlatform,
    }),
  });
  if (!response.ok) {
    throw new Error(`Device key registration failed (${response.status})`);
  }

  const registered: DeviceKeyRecord = { ...record, registered: true };
  const db = await openDatabase();
  try {
    await idbPut(db, registered);
  } finally {
    db.close();
  }
  return registered;
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
