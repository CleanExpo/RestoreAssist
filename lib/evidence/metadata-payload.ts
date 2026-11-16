/**
 * RA-8388 — the canonical metadata payload: the pre-image of the signature on
 * a metadata-only evidence submission.
 *
 * WHY THIS MODULE EXISTS
 *
 * A photo submission has obvious bytes to hash. A moisture reading, a
 * technician note, an ambient reading and an equipment log do not, which is
 * why `app/api/inspections/[id]/evidence/route.ts` carried an interim that
 * refused them outright and why every text capture in the product has been
 * rejected in production since RA-7095.
 *
 * The tempting definition — "hash the fields the server persists" — is
 * circular. `buildEvidenceStructuredDataObject` injects `c2paManifest`
 * (including the signature itself) and `signedManifestVerified` into
 * `structuredData` before it is stored, so the persisted value cannot be known
 * until verification succeeds, and verification needs the digest.
 *
 * So the pre-image is the CLIENT's payload, normalised here, hashed before
 * anything server-side touches it. The normalisation cannot live in two
 * places that agree by convention, because three conventions had already
 * drifted apart:
 *
 *   1. the wire field is `notes`; the column is `description`
 *      (route.ts:224-225)
 *   2. a blank title becomes the evidence class server-side (route.ts:219-223)
 *   3. EQUIPMENT_LOG sends neither field (capture/page.tsx:553-574), and the
 *      canonicaliser drops absent keys (manifest-canonical.ts:60-62) while the
 *      server writes explicit nulls
 *
 * Each one on its own makes the client's digest differ from the server's, and
 * the user is told their evidence "may have been altered after signing".
 * Therefore: ONE normaliser, called by both sides, emitting every key
 * explicitly. The route persists this module's output verbatim and does not
 * normalise a second time.
 *
 * Canonical bytes come from `canonicalizeManifest`, the same dependency-free
 * JCS-style serialiser the manifest signer uses, so there is one owner for
 * "what are the exact bytes" as well.
 */
import { canonicalizeManifest } from "./manifest-canonical";

/**
 * Version of the payload shape, carried INSIDE the signed bytes.
 *
 * A stored signature must still re-verify years later in a dispute. A
 * pre-image whose shape can change without a version is a pre-image that
 * cannot be re-verified, so this travels with every signature and a reader
 * can always tell which rules produced the digest it is checking.
 */
export const METADATA_PAYLOAD_VERSION = 1 as const;

/** The submission as the client holds it, using the wire field names. */
export interface MetadataPayloadInput {
  evidenceClass: string;
  /** May be blank or absent; falls back to the evidence class. */
  title?: string | null;
  /** Wire name. Persisted as `description`. */
  notes?: string | null;
  structuredData?: unknown;
}

/**
 * The normalised payload. Every key is always present, so an absent input key
 * and an explicitly undefined one canonicalise to identical bytes.
 */
export interface CanonicalMetadataPayload {
  payloadVersion: typeof METADATA_PAYLOAD_VERSION;
  evidenceClass: string;
  /** Trimmed, or the evidence class when the client sent nothing usable. */
  title: string;
  /** The wire `notes`, empty string collapsed to null. */
  description: string | null;
  structuredData: unknown;
}

/**
 * Normalise a submission into the exact object both sides hash, and the exact
 * values the route persists. Callers must not re-normalise afterwards: doing
 * so is how the two sides drifted apart in the first place.
 */
export function canonicalMetadataPayload(
  input: MetadataPayloadInput,
): CanonicalMetadataPayload {
  const evidenceClass = input.evidenceClass;

  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  const title = rawTitle.length > 0 ? rawTitle : evidenceClass;

  const rawNotes = typeof input.notes === "string" ? input.notes : "";
  const description = rawNotes.length > 0 ? rawNotes : null;

  const structuredData =
    input.structuredData === undefined ? null : input.structuredData;

  return {
    payloadVersion: METADATA_PAYLOAD_VERSION,
    evidenceClass,
    title,
    description,
    structuredData,
  };
}

/**
 * The exact bytes that get hashed. Throws rather than silently serialising a
 * value that cannot round-trip deterministically — a payload that cannot
 * canonicalise must never be signed.
 */
export function canonicalMetadataPayloadBytes(
  input: MetadataPayloadInput,
): string {
  return canonicalizeManifest(canonicalMetadataPayload(input));
}

/**
 * SHA-256 (lowercase hex) over the canonical payload bytes. This is the value
 * that travels in the manifest's `sha256` slot when `digestKind` is
 * "metadata", and the value the server independently recomputes before it will
 * accept the submission.
 *
 * WebCrypto, not node:crypto, so the identical code path runs in the browser
 * signer and on the server verifier. Two implementations of "the digest" would
 * reintroduce exactly the divergence this module exists to remove.
 */
export async function metadataPayloadSha256(
  input: MetadataPayloadInput,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMetadataPayloadBytes(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
