"use client";

/**
 * RA-8388: the ONE client-side writer for metadata-only evidence.
 *
 * Why this is a module and not inline page code:
 *
 * Before this, the capture page built the request body by hand and posted it
 * unsigned, and the route test built its own body by hand to check the server.
 * Both "agreed" and both were wrong in the same place at once, which is how a
 * suite stayed green while every reading, note and equipment log in production
 * was refused with "This account has a registered signing key". A test that
 * reconstructs what the page sends cannot catch the page sending something
 * else.
 *
 * So the page and the test now call THIS function. The bytes that reach the
 * server are built once, here, and nobody gets a second opinion about their
 * shape.
 */

import {
  createSignedMetadataManifest,
  type DeviceKeyRecord,
} from "./device-signing";
import {
  canonicalMetadataPayload,
  metadataPayloadSha256,
  METADATA_PAYLOAD_VERSION,
} from "./metadata-payload";
import { evidenceIdempotencyKey } from "./ios-capture";
import { submitSignedCapture } from "./capture-submit";

/**
 * One reading, note or equipment log as the technician entered it.
 *
 * `capturedAt` is part of the draft rather than minted at send time, and that
 * is the whole point of the type. A retry after a lost response must reuse
 * the SAME draft, because the idempotency key is derived from the draft's
 * content plus this timestamp. When the clock was read at send time, a second
 * tap produced a new key, the server saw a brand-new submission, and a single
 * measurement was written into insurance evidence twice with no way to tell
 * the duplicate from a genuine second reading.
 *
 * Two genuinely different readings still differ — in value, label, or the
 * moment they were confirmed — so they keep separate keys and both persist.
 */
export interface MetadataEvidenceDraft {
  inspectionId: string;
  workflowStepId: string | null;
  evidenceClass: string;
  title: string;
  notes: string | null;
  structuredData: Record<string, unknown> | null;
  /** ISO-8601. Minted ONCE, when the technician confirms the entry. */
  capturedAt: string;
  deviceType: string;
}

export interface SignedRequestBytes {
  manifestJson: string;
  signature: string;
}

export interface SubmitMetadataDeps {
  /** Returns a registered device key, registering one on first use. */
  ensureKey: () => Promise<DeviceKeyRecord>;
  /** Replaces a key the server rejected, so the retry can be re-signed. */
  rotateKey: () => Promise<void>;
  userId: string;
  /**
   * Survives across retries of one draft, so an uncertain POST replays the
   * EXACT bytes it already signed. Re-signing would change the manifest and
   * turn a legitimate retry into a false conflict.
   */
  signedCache: Map<string, SignedRequestBytes>;
  fetchImpl?: typeof fetch;
}

export interface MetadataSubmitResult {
  ok: boolean;
  status: number;
  /** Parsed response body, or null when the response carried no JSON. */
  data: unknown;
  /** The key this submission used; stable across retries of one draft. */
  idempotencyKey: string;
}

/** Mint the capture time for a NEW draft. Call once, when the entry is confirmed. */
export function newDraftCapturedAt(now: Date = new Date()): string {
  return now.toISOString();
}

/**
 * The exact request body for a metadata submission.
 *
 * The normalised values go on the wire, so the bytes the server hashes are
 * the bytes the signature covers. The server normalises again on receipt,
 * which is idempotent: trimming an already-trimmed title and defaulting an
 * already-null description both return what they were given.
 */
export function metadataRequestBody(
  draft: MetadataEvidenceDraft,
  signed: SignedRequestBytes,
): Record<string, unknown> {
  const payload = canonicalMetadataPayload({
    evidenceClass: draft.evidenceClass,
    title: draft.title,
    notes: draft.notes,
    structuredData: draft.structuredData,
  });
  return {
    workflowStepId: draft.workflowStepId,
    evidenceClass: draft.evidenceClass,
    title: payload.title,
    notes: payload.description,
    structuredData: payload.structuredData,
    signedManifest: signed.manifestJson,
    manifestSignature: signed.signature,
    deviceType: draft.deviceType,
  };
}

/** The digest the server will recompute from the fields it is about to persist. */
export function metadataDraftDigest(
  draft: MetadataEvidenceDraft,
): Promise<string> {
  return metadataPayloadSha256({
    evidenceClass: draft.evidenceClass,
    title: draft.title,
    notes: draft.notes,
    structuredData: draft.structuredData,
  });
}

/**
 * The retry key for a draft: content plus capture time plus submission
 * context, never a clock read at send time and never a fresh random value.
 */
export async function metadataDraftIdempotencyKey(
  draft: MetadataEvidenceDraft,
  variant?: string,
): Promise<string> {
  const sha256 = await metadataDraftDigest(draft);
  return evidenceIdempotencyKey(
    { sha256, capturedAt: draft.capturedAt },
    {
      inspectionId: draft.inspectionId,
      workflowStepId: draft.workflowStepId,
      evidenceClass: draft.evidenceClass,
      variant,
    },
  );
}

/**
 * Sign and POST one metadata draft.
 *
 * Mirrors the photo path exactly: derive a content-bound idempotency key,
 * cache the signed bytes under it, and let `submitSignedCapture` handle a
 * server-rejected device key by rotating and re-signing once. The re-signed
 * attempt is scoped through `evidenceIdempotencyKey`'s own `variant`
 * argument rather than by appending to the finished key, because the key has
 * a 255-character server bound that a hand-appended suffix can breach.
 */
export async function submitMetadataEvidence(
  draft: MetadataEvidenceDraft,
  deps: SubmitMetadataDeps,
): Promise<MetadataSubmitResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const digest = await metadataDraftDigest(draft);

  let lastResponse: Response | null = null;
  let usedKey = "";

  const signAndPost = async (attempt: "initial" | "resigned") => {
    const idempotencyKey = await metadataDraftIdempotencyKey(
      draft,
      attempt === "resigned" ? "resigned" : undefined,
    );
    usedKey = idempotencyKey;

    let signed = deps.signedCache.get(idempotencyKey);
    if (!signed) {
      const key = await deps.ensureKey();
      const built = await createSignedMetadataManifest(
        {
          inspectionId: draft.inspectionId,
          workflowStepId: draft.workflowStepId,
          evidenceClass: draft.evidenceClass,
          userId: deps.userId,
          metadataSha256: digest,
          capturedAt: draft.capturedAt,
          payloadVersion: METADATA_PAYLOAD_VERSION,
        },
        key,
      );
      signed = { manifestJson: built.manifestJson, signature: built.signature };
      deps.signedCache.set(idempotencyKey, signed);
    }

    lastResponse = await doFetch(
      `/api/inspections/${draft.inspectionId}/evidence`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(metadataRequestBody(draft, signed)),
      },
    );
    return { status: lastResponse.status, ok: lastResponse.ok };
  };

  const outcome = await submitSignedCapture({
    signAndPost,
    rotateKey: deps.rotateKey,
  });

  const response = lastResponse as Response | null;
  let data: unknown = null;
  if (response) {
    data = await response.json().catch(() => null);
  }

  return {
    ok: outcome.ok && Boolean(response?.ok),
    status: response?.status ?? 0,
    data,
    idempotencyKey: usedKey,
  };
}
