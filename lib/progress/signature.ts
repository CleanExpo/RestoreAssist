/**
 * Pi-Sign — in-house e-signature for ProgressAttestation. RA-1703.
 *
 * Replaces DocuSign for V1. The signature itself is captured as a
 * base64-encoded PNG/SVG data URL in the browser; this module owns
 * server-side validation + integrity-hash computation + verification.
 *
 * Integrity hash design (Legal Paper §4 chain-of-custody):
 *   sha256(
 *     attestorUserId || ":" ||
 *     attestationType || ":" ||
 *     claimProgressId || ":" ||
 *     attestedAtIsoMillis || ":" ||
 *     sha256(signatureDataUrl)
 *   )
 *
 * The inner sha256 of the signature avoids quoting megabytes of base64
 * into the outer hash input. Storing both the data URL AND its hash
 * derivative means any later mutation of the data URL changes the
 * recomputed integrity hash, surfacing tampering on read.
 */

import crypto from "crypto";

// ─── data-URL validation ─────────────────────────────────────────────────────

/** Cap signature payloads at 200 KB. A typical signature canvas (600×200
 *  PNG with low complexity) fits comfortably under 30 KB. 200 KB guards
 *  against pasted images / abuse without rejecting legitimate input. */
export const SIGNATURE_MAX_BYTES = 200 * 1024;

const ALLOWED_DATA_URL_PREFIXES = [
  "data:image/png;base64,",
  "data:image/svg+xml;base64,",
] as const;

export type SignatureValidationResult =
  | { ok: true; mimeType: "image/png" | "image/svg+xml"; sizeBytes: number }
  | { ok: false; error: string };

export function validateSignatureDataUrl(
  s: unknown,
): SignatureValidationResult {
  if (typeof s !== "string" || s.length === 0) {
    return { ok: false, error: "signatureDataUrl is required" };
  }
  if (s.length > SIGNATURE_MAX_BYTES * 2) {
    // Quick reject before parsing — base64 is ~4/3 the byte size, but
    // gate at 2x cap to avoid hashing pathological strings.
    return { ok: false, error: "signatureDataUrl exceeds size cap" };
  }
  let mimeType: "image/png" | "image/svg+xml" | null = null;
  let payload = "";
  for (const prefix of ALLOWED_DATA_URL_PREFIXES) {
    if (s.startsWith(prefix)) {
      mimeType = prefix.includes("png") ? "image/png" : "image/svg+xml";
      payload = s.slice(prefix.length);
      break;
    }
  }
  if (!mimeType) {
    return {
      ok: false,
      error:
        "signatureDataUrl must be base64 PNG (data:image/png;base64,…) or base64 SVG",
    };
  }
  // Validate base64 — refuse on malformed payloads so attestation rows
  // don't store junk.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return { ok: false, error: "signatureDataUrl payload is not valid base64" };
  }
  // Buffer.from is lenient — round-trip check catches truly broken input.
  if (bytes.toString("base64").length === 0 && payload.length > 0) {
    return { ok: false, error: "signatureDataUrl payload is not valid base64" };
  }
  if (bytes.length > SIGNATURE_MAX_BYTES) {
    return {
      ok: false,
      error: `decoded signature exceeds ${SIGNATURE_MAX_BYTES} bytes`,
    };
  }
  if (bytes.length === 0) {
    return { ok: false, error: "decoded signature is empty" };
  }
  return { ok: true, mimeType, sizeBytes: bytes.length };
}

// ─── integrity hash ──────────────────────────────────────────────────────────

export interface IntegrityHashInput {
  attestorUserId: string;
  attestationType: string;
  claimProgressId: string;
  /** UTC; converted to ISO milliseconds in the hash input. */
  attestedAt: Date;
  signatureDataUrl: string;
}

export function computeAttestationIntegrityHash(
  input: IntegrityHashInput,
): string {
  const sigDigest = crypto
    .createHash("sha256")
    .update(input.signatureDataUrl)
    .digest("hex");
  const material = [
    input.attestorUserId,
    input.attestationType,
    input.claimProgressId,
    input.attestedAt.toISOString(),
    sigDigest,
  ].join(":");
  return crypto.createHash("sha256").update(material).digest("hex");
}

export interface AttestationForVerify {
  attestorUserId: string;
  attestationType: string;
  claimProgressId: string;
  attestedAt: Date;
  signatureDataUrl: string | null;
  integrityHash: string;
}

export type IntegrityVerification =
  | { ok: true }
  | { ok: false; error: string };

/** Recompute the integrity hash and constant-time compare. */
export function verifyAttestationIntegrity(
  attestation: AttestationForVerify,
): IntegrityVerification {
  if (!attestation.signatureDataUrl) {
    return { ok: false, error: "attestation has no signatureDataUrl" };
  }
  const expected = computeAttestationIntegrityHash({
    attestorUserId: attestation.attestorUserId,
    attestationType: attestation.attestationType,
    claimProgressId: attestation.claimProgressId,
    attestedAt: attestation.attestedAt,
    signatureDataUrl: attestation.signatureDataUrl,
  });
  if (!constantTimeEqual(expected, attestation.integrityHash)) {
    return { ok: false, error: "integrity hash mismatch — attestation tampered" };
  }
  return { ok: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return crypto.timingSafeEqual(ba, bb);
}
