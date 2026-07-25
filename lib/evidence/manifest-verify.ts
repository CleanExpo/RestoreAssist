/**
 * RA-7090 slice 2: server-side verification of signed capture manifests.
 * Pure functions — DB lookup (DeviceSigningKey) stays in the route so this
 * module is testable without Prisma.
 *
 * Failure semantics (ticket acceptance criteria):
 *   - 400 VALIDATION  → malformed manifest, bad signature (tampered
 *     manifest), byte-hash mismatch (tampered bytes), context mismatch
 *   - 403 FORBIDDEN   → unknown key, revoked key, key owned by another user
 *     (decided by the ROUTE after the key lookup; this module only reports
 *     shape/signature/binding failures)
 */

import crypto from "crypto";
import {
  canonicalizeManifest,
  type SignedEvidenceManifest,
} from "./manifest-canonical";

export type ManifestParseResult =
  | { ok: true; manifest: SignedEvidenceManifest }
  | { ok: false; message: string };

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/**
 * Parse and shape-validate a client-supplied signed manifest. Rejects
 * anything that is not a plain object carrying every required field with
 * the right type — a manifest we cannot fully interpret must never verify.
 */
export function parseSignedManifest(raw: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "signedManifest must be valid JSON" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "signedManifest must be a JSON object" };
  }
  const m = parsed as Record<string, unknown>;

  const requiredStrings = [
    "inspectionId",
    "evidenceClass",
    "capturedAt",
    "userId",
    "deviceKeyId",
    "sha256",
  ] as const;
  for (const field of requiredStrings) {
    if (typeof m[field] !== "string" || (m[field] as string).length === 0) {
      return { ok: false, message: `signedManifest.${field} is required` };
    }
  }
  if (m.workflowStepId !== null && typeof m.workflowStepId !== "string") {
    return {
      ok: false,
      message: "signedManifest.workflowStepId must be a string or null",
    };
  }
  if (m.evidenceId !== undefined && typeof m.evidenceId !== "string") {
    return {
      ok: false,
      message: "signedManifest.evidenceId must be a string when present",
    };
  }
  const gps = m.gps;
  if (gps === null || typeof gps !== "object" || Array.isArray(gps)) {
    return { ok: false, message: "signedManifest.gps is required" };
  }
  const g = gps as Record<string, unknown>;
  if (
    !isNullableNumber(g.lat) ||
    !isNullableNumber(g.lng) ||
    !isNullableNumber(g.accuracy)
  ) {
    return {
      ok: false,
      message: "signedManifest.gps must carry numeric-or-null lat/lng/accuracy",
    };
  }

  return { ok: true, manifest: parsed as unknown as SignedEvidenceManifest };
}

/**
 * Verify a base64 Ed25519 signature over the manifest's CANONICAL bytes.
 * Never verifies over raw client text — the canonical form is recomputed
 * from the parsed object, so signer and verifier agree byte-for-byte.
 */
export function verifyManifestSignature(
  manifest: SignedEvidenceManifest,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureB64, "base64");
  } catch {
    return false;
  }
  // Ed25519 signatures are exactly 64 bytes; base64-decode silently
  // tolerates garbage, so gate on the decoded length.
  if (signature.length !== 64) return false;
  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    return false;
  }
  if (publicKey.asymmetricKeyType !== "ed25519") return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalizeManifest(manifest), "utf8"),
      publicKey,
      signature,
    );
  } catch {
    return false;
  }
}

export type ManifestBindingResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Bind the verified manifest to THIS submission: the byte hash must be the
 * server-computed one and the context fields must match the request.
 */
export function checkManifestBinding(
  manifest: SignedEvidenceManifest,
  context: {
    inspectionId: string;
    evidenceClass: string;
    userId: string;
    workflowStepId: string | null;
    fileSha256: string;
  },
): ManifestBindingResult {
  if (manifest.sha256.toLowerCase() !== context.fileSha256) {
    return {
      ok: false,
      message:
        "Signed manifest hash does not match uploaded bytes — file may have been altered after signing",
    };
  }
  if (manifest.inspectionId !== context.inspectionId) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different inspection",
    };
  }
  if (manifest.evidenceClass !== context.evidenceClass) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different evidence class",
    };
  }
  if (manifest.userId !== context.userId) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different user",
    };
  }
  if ((manifest.workflowStepId ?? null) !== context.workflowStepId) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different workflow step",
    };
  }
  return { ok: true };
}
