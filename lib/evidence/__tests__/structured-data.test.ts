/**
 * RA-7090 slice 2 review round 1 (MUST-FIX 1): the shared structuredData
 * sanitiser. Every EvidenceItem writer routes through this, so the
 * "unsigned record presents as signed" hole is closed in ONE place rather
 * than per-writer.
 */
import { describe, it, expect } from "vitest";
import { buildEvidenceStructuredDataObject } from "../structured-data";
import type { SignedEvidenceManifest } from "../manifest-canonical";

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

  // Round 2 item 5: the DOCUMENTED scope was narrowed to match the code,
  // rather than the code broadened to match the documentation. A recursive
  // strip of signature-shaped keys would be actively wrong in this domain —
  // RestoreAssist legitimately stores signatures (approverSignature,
  // signatureUrl, FormSignature, e-signature at inspection sign-off), so a
  // blanket recursive delete risks destroying real customer data. These
  // tests pin the ACTUAL guarantee so the docs cannot drift ahead again.
  describe("documented sanitisation scope: top level + c2paManifest only", () => {
    it("does NOT walk nested siblings — an unknown nested key survives verbatim", () => {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: {
          integrity: { signature: "FAKE", verified: true },
        },
        fileSha256: SERVER_HASH,
      });
      // Documented and accepted: inert, because nothing reads it.
      expect(out.integrity).toEqual({ signature: "FAKE", verified: true });
    });

    it("still guarantees the only two fields a consumer may trust", () => {
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: {
          integrity: { signature: "FAKE", verified: true },
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

    it("preserves a legitimate nested signature payload (why recursion was rejected)", () => {
      const authorityForm = {
        approverSignature: "data:image/png;base64,iVBORw0KG",
        signedBy: "Homeowner",
      };
      const out = buildEvidenceStructuredDataObject({
        clientStructuredData: { authorityForm },
        fileSha256: SERVER_HASH,
      });
      expect(out.authorityForm).toEqual(authorityForm);
    });
  });
});

describe("buildEvidenceStructuredData — verified manifests", () => {
  it("persists the manifest, signature and algorithm with verified status", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: "sig-b64" },
    });
    expect(out.signedManifestVerified).toBe(true);
    expect(out.c2paManifest).toEqual({
      ...MANIFEST,
      sha256: SERVER_HASH,
      signature: "sig-b64",
      algorithm: "Ed25519",
    });
  });

  it("WHITELISTS manifest fields — a signer cannot smuggle extra keys in", () => {
    const out = buildEvidenceStructuredDataObject({
      fileSha256: SERVER_HASH,
      verified: {
        manifest: {
          ...MANIFEST,
          // Signed, but not part of the agreed manifest shape.
          isVerified: true,
          status: "ACTIVE",
          capturedByName: "Someone Else",
        } as unknown as SignedEvidenceManifest,
        signature: "sig-b64",
      },
    });
    const manifest = out.c2paManifest as Record<string, unknown>;
    expect(manifest.isVerified).toBeUndefined();
    expect(manifest.status).toBeUndefined();
    expect(manifest.capturedByName).toBeUndefined();
    expect(manifest.inspectionId).toBe("i1");
  });

  it("a verified manifest overrides any client c2paManifest wholesale", () => {
    const out = buildEvidenceStructuredDataObject({
      clientStructuredData: {
        c2paManifest: { sha256: "0".repeat(64), signature: "forged" },
      },
      fileSha256: SERVER_HASH,
      verified: { manifest: MANIFEST, signature: "real-sig" },
    });
    const manifest = out.c2paManifest as Record<string, unknown>;
    expect(manifest.signature).toBe("real-sig");
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
      verified: { manifest: MANIFEST, signature: "sig" },
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
