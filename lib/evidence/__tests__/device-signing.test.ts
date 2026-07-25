/**
 * RA-7090 slice 2: per-device Ed25519 signing — client side.
 * - canonicalization is deterministic (key order, nesting) and rejects
 *   values that cannot serialise deterministically
 * - WebCrypto-signed manifests verify with node:crypto over the SAME
 *   canonical bytes (the exact interop the server relies on)
 * - the private key is non-extractable
 * - IndexedDB persistence + one-time registration (minimal in-memory fake;
 *   fake-indexeddb is not in the lockfile and slice 2 adds no dependencies)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nodeCrypto from "crypto";
import { canonicalizeManifest } from "../manifest-canonical";
import type { SignedEvidenceManifest } from "../manifest-canonical";
import {
  createSignedManifest,
  ensureDeviceKeyRegistered,
  generateDeviceKey,
  getOrCreateDeviceKey,
  signManifest,
} from "../device-signing";
import { buildEvidenceFormData, type IOSCaptureResult } from "../ios-capture";

// ─── Minimal in-memory IndexedDB fake ───────────────────────────────────────
// Covers exactly the surface device-signing.ts touches: open → upgrade →
// objectStore get/put by key → close. Requests resolve on a microtask like
// the real event loop ordering.
function installFakeIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>();

  function makeRequest<T>(execute: () => T) {
    const request: any = { onsuccess: null, onerror: null, result: undefined };
    queueMicrotask(() => {
      try {
        request.result = execute();
        request.onsuccess?.();
      } catch (err) {
        request.error = err;
        request.onerror?.();
      }
    });
    return request;
  }

  const fakeDb = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore(name: string) {
      stores.set(name, new Map());
      return {};
    },
    transaction(_name: string, _mode: string) {
      return {
        objectStore(storeName: string) {
          const store = stores.get(storeName)!;
          return {
            get: (key: string) => makeRequest(() => store.get(key)),
            put: (value: unknown, key: string) =>
              makeRequest(() => {
                store.set(key, value);
                return key;
              }),
          };
        },
      };
    },
    close() {},
  };

  const fakeIndexedDb = {
    open(_name: string, _version: number) {
      const request: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: fakeDb,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  vi.stubGlobal("indexedDB", fakeIndexedDb);
  return { stores };
}

const CONTEXT = {
  inspectionId: "insp1",
  workflowStepId: "step1",
  evidenceClass: "PHOTO_DAMAGE",
  userId: "u1",
};

function captureFixture(sha256 = "a".repeat(64)): IOSCaptureResult {
  return {
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: "image/jpeg",
    }),
    filename: "capture-1.jpeg",
    mimeType: "image/jpeg",
    manifest: {
      capturedAt: "2026-07-25T01:02:03.000Z",
      sha256,
      lat: -33.8688,
      lng: 151.2093,
      accuracy: 5.2,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("canonicalizeManifest", () => {
  it("emits identical bytes regardless of key insertion order (recursively)", () => {
    const a = {
      sha256: "abc",
      inspectionId: "i1",
      gps: { lng: 151.2, lat: -33.8, accuracy: null },
      userId: "u1",
    };
    const b = {
      userId: "u1",
      gps: { accuracy: null, lat: -33.8, lng: 151.2 },
      inspectionId: "i1",
      sha256: "abc",
    };
    expect(canonicalizeManifest(a)).toBe(canonicalizeManifest(b));
    // Stable across repeated calls — byte-for-byte.
    expect(canonicalizeManifest(a)).toBe(canonicalizeManifest(a));
  });

  it("produces compact sorted-key JSON with no whitespace", () => {
    expect(canonicalizeManifest({ b: 1, a: { d: null, c: "x" } })).toBe(
      '{"a":{"c":"x","d":null},"b":1}',
    );
  });

  it("omits undefined optional fields (evidenceId absent ≡ undefined)", () => {
    expect(canonicalizeManifest({ a: 1, evidenceId: undefined })).toBe(
      canonicalizeManifest({ a: 1 }),
    );
  });

  it("rejects non-finite numbers and non-object roots", () => {
    expect(() => canonicalizeManifest({ a: NaN })).toThrow();
    expect(() => canonicalizeManifest({ a: Infinity })).toThrow();
    expect(() => canonicalizeManifest("just a string")).toThrow();
    expect(() => canonicalizeManifest([1, 2])).toThrow();
    expect(() => canonicalizeManifest(null)).toThrow();
  });
});

describe("generateDeviceKey + signManifest", () => {
  it("generates a NON-extractable Ed25519 private key and a stable key id", async () => {
    const key = await generateDeviceKey();
    expect(key.privateKey.extractable).toBe(false);
    expect(key.privateKey.algorithm.name).toBe("Ed25519");
    expect(key.keyId).toMatch(/^[a-f0-9]{16}$/);
    expect(key.publicKeyPem).toContain("-----BEGIN PUBLIC KEY-----");

    // keyId is derived from the public key bytes: recomputing from the PEM
    // must reproduce it (registration can never mint a divergent id).
    const spki = nodeCrypto
      .createPublicKey(key.publicKeyPem)
      .export({ format: "der", type: "spki" });
    const expected = nodeCrypto
      .createHash("sha256")
      .update(spki)
      .digest("hex")
      .slice(0, 16);
    expect(key.keyId).toBe(expected);
  });

  it("signs canonical manifest bytes that node:crypto verifies (server interop)", async () => {
    const key = await generateDeviceKey();
    const signed = await createSignedManifest(captureFixture(), CONTEXT, key);

    expect(signed.deviceKeyId).toBe(key.keyId);
    expect(signed.manifest).toEqual({
      inspectionId: "insp1",
      workflowStepId: "step1",
      evidenceClass: "PHOTO_DAMAGE",
      capturedAt: "2026-07-25T01:02:03.000Z",
      gps: { lat: -33.8688, lng: 151.2093, accuracy: 5.2 },
      userId: "u1",
      deviceKeyId: key.keyId,
      sha256: "a".repeat(64),
    });
    expect(signed.manifestJson).toBe(canonicalizeManifest(signed.manifest));

    const publicKey = nodeCrypto.createPublicKey(key.publicKeyPem);
    expect(
      nodeCrypto.verify(
        null,
        Buffer.from(signed.manifestJson, "utf8"),
        publicKey,
        Buffer.from(signed.signature, "base64"),
      ),
    ).toBe(true);

    // A single flipped manifest byte must break the signature.
    const tampered = { ...signed.manifest, sha256: "b".repeat(64) };
    expect(
      nodeCrypto.verify(
        null,
        Buffer.from(canonicalizeManifest(tampered), "utf8"),
        publicKey,
        Buffer.from(signed.signature, "base64"),
      ),
    ).toBe(false);
  });

  it("signatures from a DIFFERENT device key do not verify", async () => {
    const keyA = await generateDeviceKey();
    const keyB = await generateDeviceKey();
    const manifest: SignedEvidenceManifest = {
      ...captureFixture().manifest,
      inspectionId: "insp1",
      workflowStepId: null,
      evidenceClass: "PHOTO_DAMAGE",
      userId: "u1",
      deviceKeyId: keyA.keyId,
      gps: { lat: null, lng: null, accuracy: null },
    };
    const signature = await signManifest(keyA.privateKey, manifest);
    expect(
      nodeCrypto.verify(
        null,
        Buffer.from(canonicalizeManifest(manifest), "utf8"),
        nodeCrypto.createPublicKey(keyB.publicKeyPem),
        Buffer.from(signature, "base64"),
      ),
    ).toBe(false);
  });
});

describe("IndexedDB persistence + registration", () => {
  beforeEach(() => {
    installFakeIndexedDb();
  });

  it("getOrCreateDeviceKey persists once and returns the SAME key thereafter", async () => {
    const first = await getOrCreateDeviceKey();
    const second = await getOrCreateDeviceKey();
    expect(second.keyId).toBe(first.keyId);
    expect(second.publicKeyPem).toBe(first.publicKeyPem);
  });

  it("ensureDeviceKeyRegistered posts the public key once, then skips", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const registered = await ensureDeviceKeyRegistered("ios");
    expect(registered.registered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/devices/signing-key");
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      publicKeyId: registered.keyId,
      publicKeyPem: registered.publicKeyPem,
      devicePlatform: "ios",
    });

    // Second call: registered flag persisted — no network round-trip.
    const again = await ensureDeviceKeyRegistered("ios");
    expect(again.keyId).toBe(registered.keyId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed registration does NOT mark the key registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await expect(ensureDeviceKeyRegistered()).rejects.toThrow(
      "Device key registration failed (500)",
    );
    const record = await getOrCreateDeviceKey();
    expect(record.registered).toBe(false);
  });
});

describe("buildEvidenceFormData (signed payload)", () => {
  it("carries signedManifest + manifestSignature when supplied", async () => {
    const key = await generateDeviceKey();
    const signed = await createSignedManifest(captureFixture(), CONTEXT, key);
    const form = buildEvidenceFormData(
      captureFixture(),
      { workflowStepId: "step1", evidenceClass: "PHOTO_DAMAGE" },
      { manifestJson: signed.manifestJson, signature: signed.signature },
    );
    expect(form.get("signedManifest")).toBe(signed.manifestJson);
    expect(form.get("manifestSignature")).toBe(signed.signature);
  });

  it("omits signing fields entirely for an unsigned capture (backwards compatible)", () => {
    const form = buildEvidenceFormData(captureFixture(), {
      workflowStepId: "step1",
      evidenceClass: "PHOTO_DAMAGE",
    });
    expect(form.get("signedManifest")).toBeNull();
    expect(form.get("manifestSignature")).toBeNull();
  });
});
