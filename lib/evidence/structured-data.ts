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
] as const;

export interface VerifiedManifestInput {
  manifest: SignedEvidenceManifest;
  /** Base64 Ed25519 signature over the manifest's canonical bytes. */
  signature: string;
}

export interface BuildStructuredDataInput {
  /** Whatever the client sent (already JSON-parsed), if anything. */
  clientStructuredData?: unknown;
  /** Server-computed SHA-256 over the stored bytes; null for metadata-only. */
  fileSha256?: string | null;
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
    // (4) Whitelist — only known manifest fields cross into the record.
    const persisted: Record<string, unknown> = {};
    for (const field of VERIFIED_MANIFEST_FIELDS) {
      const value = (verified.manifest as unknown as Record<string, unknown>)[
        field
      ];
      if (value !== undefined) persisted[field] = value;
    }
    // sha256 is the SERVER hash by construction (binding already proved the
    // manifest's own sha256 equals it).
    if (fileSha256) persisted.sha256 = fileSha256;
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
