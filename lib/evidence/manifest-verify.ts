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

/** A future-dated capture is nonsense; allow only small clock skew. */
export const MAX_CAPTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Bind the verified manifest to THIS submission: the byte hash must be the
 * server-computed one and the context fields must match the request.
 *
 * Review round 1 (MUST-FIX 2): `gps` and `capturedAt` are bound too. They
 * were the two fields app/privacy/page.tsx claims are signed, yet a manifest
 * signed with Sydney coordinates could be submitted alongside Melbourne form
 * fields — the record persisted MELBOURNE while reporting signed status, and
 * lib/dispute-pack.ts prints the PERSISTED coordinates, so the signed ones
 * sat unread. The route now also DERIVES the persisted values from the
 * signed manifest, making the printed record the signed record.
 */
export function checkManifestBinding(
  manifest: SignedEvidenceManifest,
  context: {
    inspectionId: string;
    evidenceClass: string;
    userId: string;
    workflowStepId: string | null;
    fileSha256: string;
    /**
     * Form-supplied values. `undefined` means the client did not send the
     * field (no conflict possible); `null` means it explicitly sent none.
     */
    capturedLat?: number | null;
    capturedLng?: number | null;
    capturedAt?: string | null;
    /** Server clock — injected for deterministic tests. */
    now?: Date;
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

  // GPS: the form fields ride outside the signature, so a mismatch means the
  // submission is trying to persist a location the technician never signed.
  if (
    context.capturedLat !== undefined &&
    (context.capturedLat ?? null) !== (manifest.gps.lat ?? null)
  ) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different capture location",
    };
  }
  if (
    context.capturedLng !== undefined &&
    (context.capturedLng ?? null) !== (manifest.gps.lng ?? null)
  ) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different capture location",
    };
  }

  // capturedAt must parse, must not be future-dated beyond clock skew, and
  // must agree with any client-supplied timestamp.
  const manifestCapturedAt = Date.parse(manifest.capturedAt);
  if (Number.isNaN(manifestCapturedAt)) {
    return {
      ok: false,
      message: "Signed manifest capturedAt is not a valid timestamp",
    };
  }
  const now = context.now ?? new Date();
  if (manifestCapturedAt - now.getTime() > MAX_CAPTURE_CLOCK_SKEW_MS) {
    return {
      ok: false,
      message: "Signed manifest capturedAt is in the future",
    };
  }
  if (
    context.capturedAt !== undefined &&
    context.capturedAt !== null &&
    Date.parse(context.capturedAt) !== manifestCapturedAt
  ) {
    return {
      ok: false,
      message: "Signed manifest is bound to a different capture time",
    };
  }

  return { ok: true };
}
