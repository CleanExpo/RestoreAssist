/**
 * RA-7090 slice 2 (review round 1): THE single sanitiser every EvidenceItem
 * writer must use to build `structuredData`.
 *
 * Why one shared helper: review found the JSON metadata POST persisting
 * client `structuredData` verbatim, so an unsigned request could return 201
 * carrying `{"signedManifestVerified":true, c2paManifest:{signature:"AAAA"}}`.
 * The multipart path was hardened alone, which left a sibling writer able to
 * reach the same dangerous state. Estate doctrine: fix EVERY path to a
 * dangerous state through one shared helper, not one writer at a time.
 *
 * SCOPE (round 3 — CORRECTED).
 * Round 2 narrowed the documented invariant on the stated grounds that "only
 * qa-scorer.ts reads structuredData". That was WRONG, and review caught it:
 * lib/knowledge/index.ts selects structuredData and JSON.parses it into the
 * exported knowledge graph wholesale, so a nested integrity claim DOES reach
 * a consumer. The scope is therefore widened — surgically, not bluntly:
 *
 *   - INSIDE the `c2paManifest` subtree, integrity-shaped keys are stripped
 *     at ANY depth, so `c2paManifest.assertions.signature` cannot survive.
 *     That subtree is ours, and nothing legitimate nests a customer
 *     signature inside a C2PA manifest.
 *   - OUTSIDE that subtree nothing is touched. A blanket recursive strip
 *     across all of structuredData would be actively harmful here:
 *     RestoreAssist legitimately stores signatures (`approverSignature`,
 *     `signatureUrl`, `FormSignature`, e-signature capture at inspection
 *     sign-off), and deleting those on sight would destroy real customer
 *     data to guard a field we do not own.
 *
 * A consumer may trust exactly two things: `signedManifestVerified`, and the
 * contents of `c2paManifest`. Nothing else in structuredData carries any
 * trust guarantee, whatever it happens to be named.
 *
 * Invariants this helper enforces, within that scope:
 *   1. `signedManifestVerified` is SERVER-set, always. A client-supplied
 *      value is stripped before anything else is merged.
 *   2. `signature`, `algorithm` and `deviceKeyId` appear INSIDE
 *      `c2paManifest` only when the server VERIFIED a manifest.
 *   3. `c2paManifest.sha256` is the server-computed hash when one exists, and
 *      is stripped entirely when there is none (a metadata-only record must
 *      not carry an unverifiable integrity claim).
 *   4. Fields copied out of a verified manifest are WHITELISTED — a signer
 *      cannot smuggle extra keys into the persisted record.
 */

import type { SignedEvidenceManifest } from "./manifest-canonical";
import { verifyManifestSignature } from "./manifest-verify";

/** Keys the server owns outright — a client value is never honoured. */
const SERVER_OWNED_KEYS = [
  "signedManifestVerified",
  "signedManifestDowngradeReason",
  "originalStoragePath",
  "compressedStoragePath",
  "thumbnailStoragePath",
] as const;

/**
 * Integrity claims that are meaningless without a verified signature.
 * Round 3: stripped at ANY DEPTH inside the c2paManifest subtree (and only
 * there) — `c2paManifest.assertions.signature` was surviving verbatim into
 * the knowledge graph exported by lib/knowledge/index.ts.
 */
const INTEGRITY_CLAIM_KEYS = [
  "signature",
  "algorithm",
  "deviceKeyId",
  "sha256",
  // Verified-status flags: a nested one reads as a verdict to any consumer
  // that walks the manifest.
  "verified",
  "isVerified",
  "signedManifestVerified",
] as const;

const INTEGRITY_CLAIM_KEY_SET: ReadonlySet<string> = new Set(
  INTEGRITY_CLAIM_KEYS,
);

/**
 * Recursively remove integrity-shaped keys from a value that lives INSIDE
 * the c2paManifest subtree. Arrays are walked so a forgery cannot hide in
 * `assertions: [{ signature: "FAKE" }]`.
 */
function stripIntegrityClaimsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripIntegrityClaimsDeep);
  }
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (INTEGRITY_CLAIM_KEY_SET.has(key)) continue;
    out[key] = stripIntegrityClaimsDeep(child);
  }
  return out;
}

/** Exactly the manifest fields allowed to persist from a VERIFIED manifest. */
const VERIFIED_MANIFEST_FIELDS = [
  "evidenceId",
  "inspectionId",
  "workflowStepId",
  "evidenceClass",
  "capturedAt",
  "gps",
  "userId",
  "deviceKeyId",
  // RA-8388: both are inside the signed bytes. `payloadVersion` lets a stored
  // signature still be re-verified after the payload shape evolves;
  // `digestKind` says what `sha256` is a digest OF, so no reader has to guess
  // whether a given row hashed file bytes or a canonical metadata payload.
  // Additive: manifests signed before this change carry neither key, and the
  // canonicaliser skips absent keys, so they verify exactly as before.
  "payloadVersion",
  "digestKind",
] as const;

/**
 * Every top-level key a legitimately-signed manifest may carry — the
 * persisted whitelist (VERIFIED_MANIFEST_FIELDS) plus `sha256`, which the
 * server re-stamps from its own computed hash. This is the EXACT shape
 * lib/evidence/manifest-canonical.ts signs, so a verified manifest whose
 * top-level keys are all in this set canonicalises to the SAME bytes after
 * whitelisting — meaning the stored signature still re-verifies over the
 * persisted record.
 *
 * Round 5 (RA-7090 slice 2 P1): a manifest carrying ANY key outside this set
 * was previously accepted, its signature verified over the FULL signed bytes,
 * then the extra keys were silently DROPPED by the whitelist while
 * signedManifestVerified was still set true — so crypto.verify over the
 * persisted bytes would be FALSE against a record claiming verified. Such a
 * manifest is now REJECTED at persistence rather than quietly downgraded to a
 * verified-looking record.
 */
const ALLOWED_SIGNED_MANIFEST_KEYS: ReadonlySet<string> = new Set([
  ...VERIFIED_MANIFEST_FIELDS,
  "sha256",
]);

export interface VerifiedManifestInput {
  manifest: SignedEvidenceManifest;
  /** Base64 Ed25519 signature over the manifest's canonical bytes. */
  signature: string;
  /**
   * PEM of the registered device key that produced `signature`. RA-7090
   * slice 2 (P1-2): the signature is re-verified over the EXACT persisted
   * manifest subset before this record is stamped verified, so a stored
   * signature always re-verifies over the bytes actually persisted.
   */
  publicKeyPem: string;
}

export interface BuildStructuredDataInput {
  /** Whatever the client sent (already JSON-parsed), if anything. */
  clientStructuredData?: unknown;
  /** Server-computed SHA-256 over the stored bytes; null for metadata-only. */
  fileSha256?: string | null;
  /**
   * RA-8388. Server-recomputed SHA-256 over the canonical metadata payload
   * (`lib/evidence/metadata-payload.ts`), for the four classes that carry no
   * bytes. Exactly one of `fileSha256` and `metadataSha256` is set.
   *
   * This is not `fileSha256` wearing a different hat: the two are kept apart
   * so the manifest's `digestKind` always agrees with which one the server
   * computed, and a reader is never left guessing what a stored hash covers.
   */
  metadataSha256?: string | null;
  /** Set ONLY after signature + binding verification succeeded. */
  verified?: VerifiedManifestInput | null;
  /** Server-owned storage locations. */
  storagePaths?: {
    originalStoragePath?: string | null;
    compressedStoragePath?: string | null;
    thumbnailStoragePath?: string | null;
  };
  /**
   * Why this record is unsigned despite the submitter being able to sign
   * (fold-in: make the fail-open downgrade VISIBLE on the record).
   */
  downgradeReason?: string | null;
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

/**
 * Build the sanitised `structuredData` JSON string for an EvidenceItem.
 * Returns a string because every writer persists it as `String` in Prisma.
 */
export function buildEvidenceStructuredData(
  input: BuildStructuredDataInput,
): string {
  return JSON.stringify(buildEvidenceStructuredDataObject(input));
}

/** Object form — exported for assertions and for callers that re-serialise. */
export function buildEvidenceStructuredDataObject(
  input: BuildStructuredDataInput,
): Record<string, unknown> {
  const {
    clientStructuredData,
    fileSha256 = null,
    metadataSha256 = null,
    verified = null,
    storagePaths,
    downgradeReason = null,
  } = input;

  const out = asPlainObject(clientStructuredData);

  // (1) Strip every server-owned key BEFORE merging anything back.
  for (const key of SERVER_OWNED_KEYS) {
    delete out[key];
  }

  const hadClientManifest = "c2paManifest" in out;
  const clientManifest = asPlainObject(out.c2paManifest);
  delete out.c2paManifest;

  if (verified) {
    // (5) Fail-closed over the PERSISTED bytes: a verified manifest may carry
    // ONLY the agreed top-level keys. Any extra key was covered by the
    // signature but would be dropped by the whitelist below, so the stored
    // signature could not re-verify over the persisted record while
    // signedManifestVerified=true. Reject rather than silently downgrade.
    const unknownKeys = Object.keys(
      verified.manifest as unknown as Record<string, unknown>,
    ).filter((key) => !ALLOWED_SIGNED_MANIFEST_KEYS.has(key));
    if (unknownKeys.length > 0) {
      throw new Error(
        "Refusing to persist a verified manifest with unknown top-level " +
          `field(s) [${unknownKeys.join(", ")}] — the whitelist would drop ` +
          "them, so the stored signature could not re-verify over the " +
          "persisted bytes",
      );
    }
    // (4) Whitelist — only known manifest fields cross into the record.
    const persisted: Record<string, unknown> = {};
    for (const field of VERIFIED_MANIFEST_FIELDS) {
      const value = (verified.manifest as unknown as Record<string, unknown>)[
        field
      ];
      if (value !== undefined) persisted[field] = value;
    }
    // sha256 is the SERVER hash by construction (binding already proved the
    // manifest's own sha256 equals it) — for BOTH digest kinds.
    //
    // RA-8388: this used to be `if (fileSha256)` alone, which made a signed
    // metadata submission impossible rather than merely unsupported. With no
    // file hash the key was dropped from the persisted subset while the
    // signature covered it, so the fail-closed re-verify below rejected every
    // such record — a 500 on 100% of signed metadata, not a security win.
    //
    // Invariant 3 of this module used to read "a metadata-only record must
    // not carry an unverifiable integrity claim". Its reason was that
    // metadata had nothing to hash. It now does, and the claim IS verifiable:
    // the server recomputes the canonical payload digest itself before this
    // point. The invariant is therefore restated rather than weakened — the
    // persisted sha256 is always a digest THE SERVER computed, never a client
    // claim, and `digestKind` in the signed bytes says what it covers.
    const serverDigest = fileSha256 ?? metadataSha256;
    if (serverDigest) persisted.sha256 = serverDigest;

    // (P1-2) Re-verify the signature over the EXACT persisted manifest subset
    // — the bytes we are about to store — BEFORE stamping verified. The route
    // verified the INCOMING canonical object, but the record persists a
    // rebuilt subset; if the two ever diverge the stored signature would not
    // re-verify over the persisted bytes while the record claimed verified.
    // This closes that gap: a stored signature ALWAYS re-verifies over the
    // persisted representation, or we fail CLOSED here.
    if (
      !verifyManifestSignature(
        persisted as unknown as SignedEvidenceManifest,
        verified.signature,
        verified.publicKeyPem,
      )
    ) {
      throw new Error(
        "Refusing to persist a verified manifest whose signature does not " +
          "re-verify over the persisted bytes",
      );
    }

    persisted.signature = verified.signature;
    persisted.algorithm = "Ed25519";
    out.c2paManifest = persisted;
    out.signedManifestVerified = true;
  } else {
    if (hadClientManifest) {
      // (2)+(3) An UNVERIFIED manifest keeps its descriptive metadata but
      // loses every integrity claim; the server hash is re-stamped when one
      // exists so the record can still be checked against stored bytes.
      // Round 3: stripped at ANY DEPTH within this subtree — a nested
      // `assertions.signature` used to survive into the exported knowledge
      // graph (lib/knowledge/index.ts).
      const sanitised = stripIntegrityClaimsDeep(clientManifest) as Record<
        string,
        unknown
      >;
      if (fileSha256) sanitised.sha256 = fileSha256;
      out.c2paManifest = sanitised;
    }
    out.signedManifestVerified = false;
    if (downgradeReason) {
      out.signedManifestDowngradeReason = downgradeReason;
    }
  }

  if (storagePaths) {
    if (storagePaths.originalStoragePath !== undefined) {
      out.originalStoragePath = storagePaths.originalStoragePath;
    }
    if (storagePaths.compressedStoragePath !== undefined) {
      out.compressedStoragePath = storagePaths.compressedStoragePath;
    }
    if (storagePaths.thumbnailStoragePath !== undefined) {
      out.thumbnailStoragePath = storagePaths.thumbnailStoragePath;
    }
  }

  return out;
}
