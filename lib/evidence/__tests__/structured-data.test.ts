/**
 * RA-7090 slice 2 review round 1 (MUST-FIX 1): the shared structuredData
 * sanitiser. Every EvidenceItem writer routes through this, so the
 * "unsigned record presents as signed" hole is closed in ONE place rather
 * than per-writer.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { buildEvidenceStructuredDataObject } from "../structured-data";
import {
  canonicalizeManifest,
  type SignedEvidenceManifest,
} from "../manifest-canonical";

const SERVER_HASH = "a".repeat(64);

const MANIFEST: SignedEvidenceManifest = {
  inspectionId: "i1",
  workflowStepId: "step1",
  evidenceClass: "PHOTO_DAMAGE",
  capturedAt: "2026-07-25T00:00:00.000Z",
  gps: { lat: -33.8688, lng: 151.2093, accuracy: 5 },
  userId: "u1",
  deviceKeyId: "abcdef0123456789",
  sha256: SERVER_HASH,
};

// P1-2: buildEvidenceStructuredData now RE-VERIFIES the signature over the
// EXACT persisted manifest subset, so tests must sign with a real Ed25519 key.
const KEYPAIR = crypto.generateKeyPairSync("ed25519");
const PUBLIC_PEM = KEYPAIR.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

/** Sign the canonical bytes of a manifest-shaped object. */
function sign(manifestSubset: Record<string, unknown>): string {
  return crypto
    .sign(
      null,
      Buffer.from(canonicalizeManifest(manifestSubset), "utf8"),
      KEYPAIR.privateKey,
    )
    .toString("base64");
}

// The persisted subset for MANIFEST at fileSha256=SERVER_HASH is MANIFEST
// itself (all fields whitelisted, sha256 already equals SERVER_HASH), so a
// signature over MANIFEST re-verifies over the persisted bytes.
const VALID_SIG = sign(MANIFEST as unknown as Record<string, unknown>);

describe("buildEvidenceStructuredData — forged status claims", () => {
  it("strips a client-supplied signedManifestVerified:true", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        signedManifestVerified: true,
        note: "kept",
      },
      fileSha256: SERVER_HASH,
    });
    expect(out.signedManifestVerified).toBe(false);
    expect(out.note).toBe("kept");
  });

  it("strips forged integrity claims from an UNVERIFIED c2paManifest", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        c2paManifest: {
          capturedAt: "2026-07-25T00:00:00.000Z",
          sha256: "0".repeat(64),
          signature: "AAAA",
          algorithm: "Ed25519",
          deviceKeyId: "attacker-key",
        },
      },
      fileSha256: SERVER_HASH,
    });
    const manifest = out.c2paManifest as Record<string, unknown>;
    expect(out.signedManifestVerified).toBe(false);
    expect(manifest.signature).toBeUndefined();
    expect(manifest.algorithm).toBeUndefined();
    expect(manifest.deviceKeyId).toBeUndefined();
    // Server hash replaces the claimed one; descriptive metadata survives.
    expect(manifest.sha256).toBe(SERVER_HASH);
    expect(manifest.capturedAt).toBe("2026-07-25T00:00:00.000Z");
  });

  it("strips the hash claim entirely when there is NO server-computed hash", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        c2paManifest: { sha256: "0".repeat(64), signature: "AAAA" },
      },
      fileSha256: null,
    });
    const manifest = out.c2paManifest as Record<string, unknown>;
    expect(manifest.sha256).toBeUndefined();
    expect(manifest.signature).toBeUndefined();
    expect(out.signedManifestVerified).toBe(false);
  });

  it("normalises a non-object c2paManifest instead of persisting it verbatim", () => {
    for (const bad of ["a string", ["an", "array"], null]) {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: { c2paManifest: bad },
        fileSha256: SERVER_HASH,
      });
      expect(out.c2paManifest).toEqual({ sha256: SERVER_HASH });
    }
  });

  it("ignores client-supplied storage paths (server-owned)", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: { originalStoragePath: "attacker/path.jpg" },
      fileSha256: SERVER_HASH,
      storagePaths: { originalStoragePath: "evidence/real.jpg" },
    });
    expect(out.originalStoragePath).toBe("evidence/real.jpg");
  });

  // Round 3 CORRECTION. Round 2 justified a narrow scope with "only
  // qa-scorer.ts reads structuredData" — which was FALSE:
  // lib/knowledge/index.ts JSON.parses structuredData into the exported
  // knowledge graph wholesale, so a nested integrity claim DOES reach a
  // consumer. The strip is now deep INSIDE the c2paManifest subtree, and
  // still untouched outside it.
  describe("sanitisation scope: deep inside c2paManifest, nothing outside", () => {
    it("strips a NESTED c2paManifest.assertions.signature forgery", () => {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: {
          c2paManifest: {
            capturedAt: "2026-07-25T00:00:00.000Z",
            assertions: {
              signature: "FAKE",
              verified: true,
              detail: { deviceKeyId: "attacker-key", label: "keep me" },
            },
          },
        },
        fileSha256: SERVER_HASH,
      });
      const manifest = out.c2paManifest as any;
      expect(manifest.assertions.signature).toBeUndefined();
      expect(manifest.assertions.verified).toBeUndefined();
      expect(manifest.assertions.detail.deviceKeyId).toBeUndefined();
      // Non-integrity metadata inside the subtree is preserved.
      expect(manifest.assertions.detail.label).toBe("keep me");
      expect(manifest.capturedAt).toBe("2026-07-25T00:00:00.000Z");
      expect(manifest.sha256).toBe(SERVER_HASH);
    });

    it("strips forgeries hidden inside an ARRAY within the manifest", () => {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: {
          c2paManifest: {
            assertions: [
              { signature: "FAKE", kind: "c2pa.hash.data" },
              { isVerified: true, kind: "c2pa.actions" },
            ],
          },
        },
        fileSha256: SERVER_HASH,
      });
      const assertions = (out.c2paManifest as any).assertions;
      expect(assertions).toHaveLength(2);
      expect(assertions[0].signature).toBeUndefined();
      expect(assertions[0].kind).toBe("c2pa.hash.data");
      expect(assertions[1].isVerified).toBeUndefined();
    });

    it("does NOT touch anything outside the c2paManifest subtree", () => {
      // A blanket recursive strip would destroy real customer data:
      // approverSignature / signatureUrl / FormSignature are genuine domain
      // fields (prisma/schema.prisma), so the strip is deliberately scoped.
      const authorityForm = {
        approverSignature: "data:image/png;base64,iVBORw0KG",
        signatureUrl: "https://storage/sig.png",
        signedBy: "Homeowner",
      };
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: { authorityForm },
        fileSha256: SERVER_HASH,
      });
      expect(out.authorityForm).toEqual(authorityForm);
    });

    it("guarantees the only two fields a consumer may trust", () => {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: {
          signedManifestVerified: true,
          c2paManifest: { signature: "FAKE", sha256: "0".repeat(64) },
        },
        fileSha256: SERVER_HASH,
      });
      expect(out.signedManifestVerified).toBe(false);
      expect(
        (out.c2paManifest as Record<string, unknown>).signature,
      ).toBeUndefined();
    });
  });
});

describe("buildEvidenceStructuredData — verified manifests", () => {
  it("persists the manifest, signature and algorithm with verified status", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: VALID_SIG, publicKeyPem: PUBLIC_PEM },
    });
    expect(out.signedManifestVerified).toBe(true);
    expect(out.c2paManifest).toEqual({
      ...MANIFEST,
      sha256: SERVER_HASH,
      signature: VALID_SIG,
      algorithm: "Ed25519",
    });
  });

  // POSITIVE CONTROL (P1-2): the stored signature re-verifies over the EXACT
  // persisted bytes — reconstruct the signed subset from the PERSISTED object
  // (drop signature + algorithm) and verify it independently.
  it("the persisted verified manifest re-verifies over its EXACT persisted bytes", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: VALID_SIG, publicKeyPem: PUBLIC_PEM },
    });
    const c2pa = out.c2paManifest as Record<string, unknown>;
    const { signature, algorithm, ...persistedSubset } = c2pa;
    expect(algorithm).toBe("Ed25519");
    const ok = crypto.verify(
      null,
      Buffer.from(canonicalizeManifest(persistedSubset), "utf8"),
      KEYPAIR.publicKey,
      Buffer.from(signature as string, "base64"),
    );
    expect(ok).toBe(true);
  });

  // POSITIVE CONTROL (P1-2, tamper-after-persist): a signature that does NOT
  // cover the persisted bytes is REJECTED — verified=true is impossible when
  // crypto.verify over the persisted representation would be false.
  it("FAIL-CLOSED: REJECTS a manifest whose signature does not cover the persisted bytes", () => {
    // Signature is over the ORIGINAL manifest; the manifest handed in is
    // tampered after signing, so the persisted subset no longer matches.
    const tampered = {
      ...MANIFEST,
      capturedAt: "2020-01-01T00:00:00.000Z",
    } as SignedEvidenceManifest;
    expect(() =>
      buildEvidenceStructuredDataObject({
        fileSha256: SERVER_HASH,
        verified: {
          manifest: tampered,
          signature: VALID_SIG,
          publicKeyPem: PUBLIC_PEM,
        },
      }),
    ).toThrow(/re-verify over the persisted bytes/i);
  });

  it("FAIL-CLOSED: REJECTS when the public key does not match the signature", () => {
    const otherKey = crypto
      .generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    expect(() =>
      buildEvidenceStructuredDataObject({
        fileSha256: SERVER_HASH,
        verified: {
          manifest: MANIFEST,
          signature: VALID_SIG,
          publicKeyPem: otherKey,
        },
      }),
    ).toThrow(/re-verify over the persisted bytes/i);
  });

  // POSITIVE CONTROL #3 (fail-closed persistence): the old code silently
  // WHITELISTED away extra top-level manifest keys and still stored
  // signedManifestVerified=true. The signature was computed over the FULL
  // signed bytes (extras included), but the persisted manifest dropped them,
  // so crypto.verify over the persisted bytes would be FALSE while the record
  // claimed verified. An adversarial manifest carrying ANY unknown top-level
  // field must now be REJECTED at persistence, never quietly downgraded to a
  // verified-looking record.
  it("FAIL-CLOSED: REJECTS a verified manifest carrying unknown top-level keys", () => {
    expect(() =>
      buildEvidenceStructuredDataObject({
        fileSha256: SERVER_HASH,
        verified: {
          manifest: {
            ...MANIFEST,
            // Signed, but not part of the agreed manifest shape — the
            // whitelist would drop these, breaking re-verification.
            isVerified: true,
            status: "ACTIVE",
            capturedByName: "Someone Else",
          } as unknown as SignedEvidenceManifest,
          signature: "sig-b64",
          publicKeyPem: PUBLIC_PEM,
        },
      }),
    ).toThrow(/unknown top-level field/i);
  });

  it("FAIL-CLOSED: rejection names every offending field (a single extra is enough)", () => {
    expect(() =>
      buildEvidenceStructuredDataObject({
        fileSha256: SERVER_HASH,
        verified: {
          manifest: {
            ...MANIFEST,
            extra: "one-extra-field",
          } as unknown as SignedEvidenceManifest,
          signature: "sig-b64",
          publicKeyPem: PUBLIC_PEM,
        },
      }),
    ).toThrow(/extra/);
  });

  it("accepts a clean manifest (only known top-level keys) as verified", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: VALID_SIG, publicKeyPem: PUBLIC_PEM },
    });
    expect(out.signedManifestVerified).toBe(true);
    expect((out.c2paManifest as Record<string, unknown>).inspectionId).toBe(
      "i1",
    );
  });

  it("a verified manifest overrides any client c2paManifest wholesale", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        c2paManifest: { sha256: "0".repeat(64), signature: "forged" },
      },
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: VALID_SIG, publicKeyPem: PUBLIC_PEM },
    });
    const manifest = out.c2paManifest as Record<string, unknown>;
    expect(manifest.signature).toBe(VALID_SIG);
    expect(manifest.sha256).toBe(SERVER_HASH);
  });
});

describe("downgrade reason (fold-in)", () => {
  it("records why a record is unsigned when the submitter could have signed", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      downgradeReason: "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
    });
    expect(out.signedManifestVerified).toBe(false);
    expect(out.signedManifestDowngradeReason).toBe(
      "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
    );
  });

  it("never records a downgrade reason on a VERIFIED record", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: VALID_SIG, publicKeyPem: PUBLIC_PEM },
      downgradeReason: "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION",
    });
    expect(out.signedManifestDowngradeReason).toBeUndefined();
  });

  it("strips a client-supplied downgrade reason", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        signedManifestDowngradeReason: "attacker-supplied",
      },
      fileSha256: SERVER_HASH,
    });
    expect(out.signedManifestDowngradeReason).toBeUndefined();
  });
});
