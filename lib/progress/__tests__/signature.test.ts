import { describe, expect, it } from "vitest";
import {
  SIGNATURE_MAX_BYTES,
  computeAttestationIntegrityHash,
  validateSignatureDataUrl,
  verifyAttestationIntegrity,
} from "../signature";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;
const TINY_SVG_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

describe("validateSignatureDataUrl", () => {
  it("accepts a PNG data URL", () => {
    const r = validateSignatureDataUrl(TINY_PNG_DATA_URL);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.mimeType).toBe("image/png");
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it("accepts an SVG data URL", () => {
    const r = validateSignatureDataUrl(TINY_SVG_DATA_URL);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.mimeType).toBe("image/svg+xml");
  });

  it("rejects non-string input", () => {
    expect(validateSignatureDataUrl(null).ok).toBe(false);
    expect(validateSignatureDataUrl(undefined).ok).toBe(false);
    expect(validateSignatureDataUrl(123).ok).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validateSignatureDataUrl("").ok).toBe(false);
  });

  it("rejects an unsupported MIME type", () => {
    const r = validateSignatureDataUrl(
      "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/PNG.*SVG/i);
  });

  it("rejects a payload over the byte cap", () => {
    // Build an oversized PNG: 250 KB of base64 random bytes.
    const big = Buffer.alloc(250 * 1024).toString("base64");
    const r = validateSignatureDataUrl(`data:image/png;base64,${big}`);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/exceeds/i);
  });

  it("exposes SIGNATURE_MAX_BYTES at 200 KB", () => {
    expect(SIGNATURE_MAX_BYTES).toBe(200 * 1024);
  });
});

describe("computeAttestationIntegrityHash", () => {
  const baseInput = {
    attestorUserId: "u_1",
    attestationType: "TECHNICIAN_SIGN_OFF",
    claimProgressId: "cp_1",
    attestedAt: new Date("2026-04-26T10:00:00Z"),
    signatureDataUrl: TINY_PNG_DATA_URL,
  };

  it("produces a 64-char hex sha256", () => {
    const h = computeAttestationIntegrityHash(baseInput);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = computeAttestationIntegrityHash(baseInput);
    const b = computeAttestationIntegrityHash(baseInput);
    expect(a).toBe(b);
  });

  it("differs when the signature changes", () => {
    const h1 = computeAttestationIntegrityHash(baseInput);
    const h2 = computeAttestationIntegrityHash({
      ...baseInput,
      signatureDataUrl: TINY_SVG_DATA_URL,
    });
    expect(h1).not.toBe(h2);
  });

  it("differs when the attestor changes", () => {
    const h1 = computeAttestationIntegrityHash(baseInput);
    const h2 = computeAttestationIntegrityHash({
      ...baseInput,
      attestorUserId: "u_2",
    });
    expect(h1).not.toBe(h2);
  });

  it("differs when the timestamp changes", () => {
    const h1 = computeAttestationIntegrityHash(baseInput);
    const h2 = computeAttestationIntegrityHash({
      ...baseInput,
      attestedAt: new Date("2026-04-26T10:00:01Z"),
    });
    expect(h1).not.toBe(h2);
  });
});

describe("verifyAttestationIntegrity", () => {
  const baseInput = {
    attestorUserId: "u_1",
    attestationType: "TECHNICIAN_SIGN_OFF",
    claimProgressId: "cp_1",
    attestedAt: new Date("2026-04-26T10:00:00Z"),
    signatureDataUrl: TINY_PNG_DATA_URL,
  };

  it("verifies a freshly-computed hash", () => {
    const integrityHash = computeAttestationIntegrityHash(baseInput);
    const r = verifyAttestationIntegrity({ ...baseInput, integrityHash });
    expect(r.ok).toBe(true);
  });

  it("rejects when the signature was mutated after the hash was written", () => {
    const integrityHash = computeAttestationIntegrityHash(baseInput);
    const r = verifyAttestationIntegrity({
      ...baseInput,
      signatureDataUrl: TINY_SVG_DATA_URL, // tampered
      integrityHash,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/tampered|mismatch/i);
  });

  it("rejects when the attestor was rewritten after the hash was written", () => {
    const integrityHash = computeAttestationIntegrityHash(baseInput);
    const r = verifyAttestationIntegrity({
      ...baseInput,
      attestorUserId: "u_attacker",
      integrityHash,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when signatureDataUrl is missing on read", () => {
    const integrityHash = computeAttestationIntegrityHash(baseInput);
    const r = verifyAttestationIntegrity({
      ...baseInput,
      signatureDataUrl: null,
      integrityHash,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/no signatureDataUrl/);
  });

  it("returns ok:false on hash length mismatch (defensive)", () => {
    const r = verifyAttestationIntegrity({
      ...baseInput,
      integrityHash: "tooshort",
    });
    expect(r.ok).toBe(false);
  });

  it("legacy attestation (no consent fields) verifies with legacy:true", () => {
    // Hash computed with all P0-4 fields null — this is what existing
    // pre-P0-4 rows look like.
    const integrityHash = computeAttestationIntegrityHash(baseInput);
    const r = verifyAttestationIntegrity({ ...baseInput, integrityHash });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.legacy).toBe(true);
  });

  it("P0-4 attestation (consent + IP + UA + contentHash) verifies with legacy:false", () => {
    const fullInput = {
      ...baseInput,
      consentTokenId: "ct_1",
      signerIp: "203.0.113.42",
      signerUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      contentHash: "a".repeat(64),
    };
    const integrityHash = computeAttestationIntegrityHash(fullInput);
    const r = verifyAttestationIntegrity({ ...fullInput, integrityHash });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.legacy).toBe(false);
  });

  it("rejects when the signer IP was mutated after the hash was written", () => {
    const fullInput = {
      ...baseInput,
      consentTokenId: "ct_1",
      signerIp: "203.0.113.42",
      signerUserAgent: "ua",
      contentHash: "h".repeat(64),
    };
    const integrityHash = computeAttestationIntegrityHash(fullInput);
    const r = verifyAttestationIntegrity({
      ...fullInput,
      signerIp: "10.0.0.1", // tampered
      integrityHash,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the user-agent was mutated after the hash was written", () => {
    const fullInput = {
      ...baseInput,
      consentTokenId: "ct_1",
      signerIp: "203.0.113.42",
      signerUserAgent: "Mozilla/5.0 original",
      contentHash: "h".repeat(64),
    };
    const integrityHash = computeAttestationIntegrityHash(fullInput);
    const r = verifyAttestationIntegrity({
      ...fullInput,
      signerUserAgent: "Mozilla/5.0 forged",
      integrityHash,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the consentTokenId was rewritten after the hash was written", () => {
    const fullInput = {
      ...baseInput,
      consentTokenId: "ct_original",
      signerIp: "ip",
      signerUserAgent: "ua",
      contentHash: "h".repeat(64),
    };
    const integrityHash = computeAttestationIntegrityHash(fullInput);
    const r = verifyAttestationIntegrity({
      ...fullInput,
      consentTokenId: "ct_attacker",
      integrityHash,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the contentHash was rewritten after the hash was written", () => {
    const fullInput = {
      ...baseInput,
      consentTokenId: "ct_1",
      signerIp: "ip",
      signerUserAgent: "ua",
      contentHash: "a".repeat(64),
    };
    const integrityHash = computeAttestationIntegrityHash(fullInput);
    const r = verifyAttestationIntegrity({
      ...fullInput,
      contentHash: "b".repeat(64),
      integrityHash,
    });
    expect(r.ok).toBe(false);
  });
});

describe("computeContentHash", () => {
  it("is deterministic for the same input", async () => {
    const { computeContentHash } = await import("../signature");
    expect(computeContentHash("I agree to sign foo")).toBe(
      computeContentHash("I agree to sign foo"),
    );
  });

  it("produces different hashes for different inputs", async () => {
    const { computeContentHash } = await import("../signature");
    expect(computeContentHash("agree to A")).not.toBe(
      computeContentHash("agree to B"),
    );
  });

  it("produces a 64-char hex sha256", async () => {
    const { computeContentHash } = await import("../signature");
    expect(computeContentHash("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
