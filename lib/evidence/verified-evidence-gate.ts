/**
 * RA-8388 / amendment 01 A4 — the single gate to a verified EvidenceItem.
 *
 * WHY THIS IS A MODULE AND NOT A SEQUENCE COPIED INTO EACH ROUTE
 *
 * `lib/evidence/signing-policy.ts:1-18` records that review rounds 1, 2 and 3
 * each found a writer that bypassed the signing control by not calling it. The
 * control was never wrong; it was simply not reached. The JSON metadata writer
 * would have been the fifth writer to hand-roll this sequence, and the fourth
 * to get it subtly wrong — the first draft of this change listed three of the
 * five checks and would have let a REVOKED key sign moisture readings, which
 * is worse than no revocation at all because it looks like revocation works.
 *
 * Patching another instance of a defect kind that has recurred three times is
 * forbidden. The design change is that there is exactly ONE way to reach a
 * verified evidence record: this function. The Done criterion `one-owner-gate`
 * fails the build if any route under `app/api` calls `verifyManifestSignature`
 * or `checkManifestBinding` directly again.
 *
 * The order below is load-bearing. Key identity and revocation are settled
 * BEFORE the signature is checked, so a revoked key can never produce a
 * verified record no matter how good its signature is.
 */
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";

import type { SignedEvidenceManifest } from "./manifest-canonical";
import {
  checkManifestBinding,
  parseSignedManifest,
  verifyManifestSignature,
} from "./manifest-verify";

/**
 * What the submission's digest is a digest OF.
 *
 * "file"     — SHA-256 over the uploaded bytes (photos, video, documents).
 * "metadata" — SHA-256 over the canonical metadata payload
 *              (`lib/evidence/metadata-payload.ts`), for the four classes that
 *              carry no bytes: TECHNICIAN_NOTE, MOISTURE_READING,
 *              AMBIENT_ENVIRONMENTAL, EQUIPMENT_LOG.
 *
 * The manifest's `sha256` slot is not overloaded by this, it is DEFINED by it:
 * in both cases the persisted value is a digest the server computed itself,
 * never a client claim, and this field says what it is a digest of.
 */
export type SubmissionDigestKind = "file" | "metadata";

export interface VerifyEvidenceSubmissionInput {
  /** Raw `signedManifest` field from the request, unparsed. */
  manifestRaw: unknown;
  /** Raw `manifestSignature` field from the request, unparsed. */
  signatureRaw: unknown;
  /** The authenticated caller. Ownership of the signing key is checked against this. */
  userId: string;
  inspectionId: string;
  evidenceClass: string;
  workflowStepId: string | null;
  /** Server-computed digest — file bytes, or the canonical metadata payload. */
  submissionDigest: string;
  digestKind: SubmissionDigestKind;
  /**
   * Client-supplied location, when the request carried one. `undefined` means
   * the client sent nothing, which is not a conflict; a supplied value that
   * disagrees with the signed manifest is rejected rather than silently
   * overwriting a signed one.
   */
  capturedLat?: number;
  capturedLng?: number;
  capturedAt?: string;
  /** Injectable for tests. */
  now?: Date;
}

export interface VerifiedEvidenceSubmission {
  ok: true;
  manifest: SignedEvidenceManifest;
  signature: string;
  publicKeyPem: string;
  /**
   * The provenance columns, derived from the SIGNED manifest rather than the
   * server clock or the request body.
   *
   * `lib/dispute-pack.ts:155-157` tells an insurer that on a signed record
   * `capturedAt` is a claim by the device. The multipart path already honours
   * that (`evidence/route.ts:700-707`); the JSON path stamped `new Date()`,
   * so a record printed under a signed banner carried a timestamp the
   * signature never covered. Deriving them here means no writer can get this
   * wrong again.
   */
  capturedAt: Date;
  capturedLat: number | null;
  capturedLng: number | null;
}

export interface RejectedEvidenceSubmission {
  ok: false;
  status: 400 | 403;
  code: "VALIDATION" | "FORBIDDEN";
  message: string;
}

export type VerifyEvidenceSubmissionResult =
  | VerifiedEvidenceSubmission
  | RejectedEvidenceSubmission;

function reject(
  status: 400 | 403,
  code: "VALIDATION" | "FORBIDDEN",
  message: string,
): RejectedEvidenceSubmission {
  return { ok: false, status, code, message };
}

/**
 * Verify a signed evidence submission and return the values that may be
 * persisted. Callers persist ONLY what this returns; they do not re-derive
 * provenance from the request.
 */
async function verifyEvidenceSubmissionInner(
  input: VerifyEvidenceSubmissionInput,
): Promise<VerifyEvidenceSubmissionResult> {
  const { manifestRaw, signatureRaw } = input;

  // Both or neither. A signature without a manifest, or a manifest without a
  // signature, is a malformed request and not a silent downgrade to unsigned.
  if (typeof manifestRaw !== "string" || manifestRaw.length === 0) {
    return reject(400, "VALIDATION", "signedManifest is required");
  }
  if (typeof signatureRaw !== "string" || signatureRaw.length === 0) {
    return reject(400, "VALIDATION", "manifestSignature is required");
  }

  const parsed = parseSignedManifest(manifestRaw);
  if (!parsed.ok) {
    return reject(400, "VALIDATION", parsed.message);
  }

  // (1) Key identity. An unregistered key and another user's key are
  // deliberately indistinguishable to the caller — telling them apart would
  // confirm that a given key id exists.
  const signingKey = await prisma.deviceSigningKey.findUnique({
    where: { publicKeyId: parsed.manifest.deviceKeyId },
  });
  if (!signingKey || signingKey.userId !== input.userId) {
    return reject(
      403,
      "FORBIDDEN",
      "Signing key is not registered for this user",
    );
  }

  // (2) Revocation, BEFORE the signature is checked. A revoked key must not be
  // able to produce a verified record under any circumstances.
  if (signingKey.revokedAt) {
    return reject(403, "FORBIDDEN", "Signing key has been revoked");
  }

  // (3) The signature covers the manifest.
  if (
    !verifyManifestSignature(
      parsed.manifest,
      signatureRaw,
      signingKey.publicKeyPem,
    )
  ) {
    return reject(
      400,
      "VALIDATION",
      "Manifest signature verification failed — manifest may have been tampered with",
    );
  }

  // (4) The manifest is bound to THIS submission: this inspection, this step,
  // this class, this user, and this digest.
  const binding = checkManifestBinding(parsed.manifest, {
    inspectionId: input.inspectionId,
    evidenceClass: input.evidenceClass,
    userId: input.userId,
    workflowStepId: input.workflowStepId,
    fileSha256: input.submissionDigest,
    capturedLat: input.capturedLat,
    capturedLng: input.capturedLng,
    capturedAt: input.capturedAt,
    now: input.now,
  });
  if (!binding.ok) {
    // The shared verifier's digest-mismatch wording speaks of uploaded bytes,
    // which is accurate for a photo and baffling for a moisture reading. A
    // technician who typed a number into a form should not be told a file was
    // altered. Same refusal, honest sentence.
    const message =
      input.digestKind === "metadata" &&
      binding.message.includes("does not match uploaded bytes")
        ? "This reading does not match the signature it was sent with, so it was not saved. Capture it again."
        : binding.message;
    return reject(400, "VALIDATION", message);
  }

  return {
    ok: true,
    manifest: parsed.manifest,
    signature: signatureRaw,
    publicKeyPem: signingKey.publicKeyPem,
    capturedAt: new Date(parsed.manifest.capturedAt),
    capturedLat: parsed.manifest.gps.lat,
    capturedLng: parsed.manifest.gps.lng,
  };
}

/**
 * RA-8388 (eng-observability): every refusal this gate makes is now logged.
 *
 * The gate had ZERO log calls. It is fail-closed, so when it refuses, the
 * technician sees a message and the fleet sees nothing - which means a
 * regression that refuses EVERY capture across every account looks exactly
 * like one technician mistyping a reading. That is the shape of outage that
 * runs for days.
 *
 * Logged HERE, in one wrapper, rather than at each `reject` call site: the
 * call sites have the reason but not the context, and a logging line copied
 * to a dozen sites is a line that gets missed on the thirteenth. `reject`
 * stays pure so it remains trivially testable.
 *
 * A refusal is not an exception - it is usually correct, and often the
 * control working. It is reported at error level anyway because the thing
 * worth alerting on is the RATE, and the rate cannot be measured from
 * silence.
 */
export async function verifyEvidenceSubmission(
  input: VerifyEvidenceSubmissionInput,
): Promise<VerifyEvidenceSubmissionResult> {
  const result = await verifyEvidenceSubmissionInner(input);
  if (!result.ok) {
    reportError(
      new Error(`evidence submission refused: ${result.message}`),
      {
        route: `/api/inspections/${input.inspectionId}/evidence`,
        stage: "verified-evidence-gate",
        userId: input.userId,
        inspectionId: input.inspectionId,
        evidenceClass: input.evidenceClass,
        workflowStepId: input.workflowStepId,
        digestKind: input.digestKind,
        refusalCode: result.code,
        refusalStatus: result.status,
      },
    );
  }
  return result;
}
