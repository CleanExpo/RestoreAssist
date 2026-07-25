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
 * SCOPE (round 2 item 5 — the documented invariant is NARROWED to match the
 * code, rather than the code broadened to match the documentation).
 * This helper sanitises exactly TWO locations: the TOP LEVEL of
 * structuredData, and the contents of `c2paManifest`. It does NOT walk
 * arbitrary nested objects, so a sibling such as
 * `{"integrity":{"signature":"FAKE","verified":true}}` is persisted verbatim.
 *
 * That is a deliberate choice. A recursive strip of signature-shaped keys
 * would be actively wrong in this domain: RestoreAssist legitimately stores
 * signatures (`approverSignature`, `signatureUrl`, `FormSignature`,
 * e-signature capture at inspection sign-off), so a blanket recursive delete
 * risks silently destroying real customer signature data the moment any
 * writer nests it here. The narrow rule is enforceable and testable; the
 * broad one trades a live data-loss risk for protection against a field
 * nothing reads.
 *
 * An unknown nested key is inert today — the only reader of structuredData
 * is lib/evidence/qa-scorer.ts, on known domain keys. Any FUTURE consumer of
 * an integrity claim MUST read `signedManifestVerified` and `c2paManifest`,
 * which are the only fields this helper vouches for. Nothing else in
 * structuredData carries a trust guarantee.
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

/** Integrity claims that are meaningless without a verified signature. */
const INTEGRITY_CLAIM_KEYS = [
  "signature",
  "algorithm",
  "deviceKeyId",
  "sha256",
] as const;

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
      const sanitised: Record<string, unknown> = { ...clientManifest };
      for (const key of INTEGRITY_CLAIM_KEYS) {
        delete sanitised[key];
      }
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
