/**
 * Signed release-gate receipts.
 *
 * WHY THIS EXISTS
 * ---------------
 * `docs/RELEASE_GATE.md` ("Unresolved signed-receipt producers") names this as
 * the precondition for any owner-evidence criterion earning release points:
 *
 *   "Each producer must bind its criterion ID, exact release SHA, observed
 *    environment, timestamp and raw evidence digest into a signed receipt; a
 *    separately trusted verifier must validate the signature and
 *    criterion-specific measurements."
 *
 * Until this module existed, `ownerEvidence()` in release-gate-score.ts ended
 * in an unconditional `fail` — every structural check could pass and the
 * criterion still scored zero. That is correct behaviour, not a bug: committed
 * prose is self-attestable, so a fresh date and a hash of one's own paragraph
 * prove only that the paragraph did not change. The consequence, though, is
 * that the web profile's ceiling is 50/85 while the release rule demands
 * `score == profile_max`. The gate cannot be passed, only bypassed.
 *
 * WHAT MAKES THIS DIFFERENT FROM PROSE
 * ------------------------------------
 * Three properties, each of which a committed markdown file cannot have:
 *
 *  1. **The trust root is not in the repository.** Public keys are read from
 *     the environment (`RELEASE_RECEIPT_PUBLIC_KEYS`), which on Actions means
 *     a repository secret or variable — an owner-gated surface. A committed
 *     key would be worthless: anyone who can open a pull request, this agent
 *     included, could swap in a key they hold and sign their own receipts. The
 *     whole scheme reduces to that one decision, so `trustedKeysFromEnv`
 *     refuses to read key material from disk and there is a test that fails if
 *     a future change makes it.
 *
 *  2. **It fails closed at every absence.** No key set configured, an unknown
 *     key id, or a criterion with no registered policy all return `fail`.
 *     Adding a criterion to the gate must therefore be a deliberate act, not
 *     something that falls out of a receipt file appearing.
 *
 *     Authority is scoped per key rather than granted wholesale: a key lists
 *     the criteria it may speak for, so the Stripe reconciliation producer's
 *     key cannot sign a secrets-scan receipt. Producers run in different
 *     places with different blast radii, and one leaked key should not be
 *     able to satisfy the whole gate.
 *
 *  3. **Measurements are re-derived, not believed.** A signature proves who
 *     said it, never that it is true. So the binding check recomputes what it
 *     can: the release SHA and tree against this checkout, and the evidence
 *     digest against the actual `## Evidence` section. A receipt that scanned
 *     a different tree is rejected even when the signature is perfect.
 *
 *     What it cannot re-derive it constrains: the observed `environment` is
 *     checked against the criterion's policy, because a field carried but
 *     never compared is worse than an absent one -- it reads as a control in
 *     the receipt and in review while permitting anything. The residual trust
 *     is stated rather than papered over. A scanner's finding count is the
 *     producer's word, pinned to an exact tree; a measurement CI could take
 *     unaided does not belong here at all, but as a machine criterion.
 *
 * Signing lives in `scripts/ci/sign-release-receipt.ts`, which needs a private
 * key this repository does not contain and must never contain.
 */

import crypto from "node:crypto";

// Deliberately the SAME canonicaliser the signed capture manifests use, not a
// second one. Signature schemes break when signer and verifier disagree by a
// byte, and a near-duplicate serialiser is precisely the kind of drift
// CLAUDE.md's "single sources of truth" table exists to prevent. The name says
// manifest; the function takes `unknown` and emits JCS (RFC 8785)-style bytes
// for any plain object.
import { canonicalizeManifest as canonicalJson } from "../../lib/evidence/manifest-canonical";

/** Environment variable carrying the trusted public keys, as JSON. */
export const TRUSTED_KEYS_ENV = "RELEASE_RECEIPT_PUBLIC_KEYS";

/**
 * A receipt's own claim about when it was produced.
 *
 * Both directions are bounded. A future timestamp would make a receipt
 * permanently fresh, which is the same defect the evidence-file freshness rule
 * already had to fix; the past bound is what stops a receipt signed once from
 * unlocking the gate forever.
 */
export const MAX_RECEIPT_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ReleaseReceipt {
  /** Criterion this receipt speaks for, e.g. "C2-secrets-scan". */
  criterionId: string;
  /** Gate version the receipt was produced against. */
  gateVersion: string;
  /** Commit the measurement was taken on. Must be this checkout's HEAD. */
  releaseSha: string;
  /** Tree of that commit. Recomputed by the verifier, never taken on trust. */
  releaseTree: string;
  /** Where the measurement was observed, e.g. "ci" or "production". */
  environment: string;
  /** ISO-8601 timestamp of the measurement. */
  issuedAt: string;
  /** `sha256:<64 hex>` over the evidence file's `## Evidence` section. */
  evidenceDigest: string;
  /** Criterion-specific measurements, validated by a registered check. */
  measurements: Record<string, string | number | boolean>;
}

export interface SignedReleaseReceipt {
  /** Selects the public key; an unknown id is a rejection, not a fallback. */
  keyId: string;
  /** Base64 Ed25519 signature over the canonical bytes of `receipt`. */
  signature: string;
  receipt: ReleaseReceipt;
}

export type ReceiptResult = { ok: true } | { ok: false; message: string };

type ParseResult =
  | { ok: true; signed: SignedReleaseReceipt }
  | { ok: false; message: string };

const RECEIPT_FIELDS = [
  "criterionId",
  "gateVersion",
  "releaseSha",
  "releaseTree",
  "environment",
  "issuedAt",
  "evidenceDigest",
  "measurements",
] as const;

const SIGNED_FIELDS = ["keyId", "signature", "receipt"] as const;

/** True for a non-null, non-array object: the only shape a receipt may take. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for a string with content. Empty strings are treated as absent. */
function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A trusted signing key and the criteria it is allowed to speak for. */
export interface TrustedKey {
  publicKeyPem: string;
  /** Criterion ids this key may sign. Never empty; never a wildcard. */
  criteria: string[];
}

/**
 * Read the trusted key set from the environment.
 *
 * There is no file fallback and there must never be one — see property 1 in
 * the module comment. An absent or malformed value yields an EMPTY map, and an
 * empty map verifies nothing.
 *
 * The format requires every key to declare its scope:
 *
 *   {"<key-id>": {"publicKey": "<PEM>", "criteria": ["C2-secrets-scan"]}}
 *
 * A bare `"<key-id>": "<PEM>"` is REJECTED rather than read as unscoped.
 * Authority over the whole gate granted by omission is the kind of default
 * nobody revisits.
 */
export function trustedKeysFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Map<string, TrustedKey> {
  const raw = env[TRUSTED_KEYS_ENV];
  if (!nonEmptyString(raw)) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }
  if (!isPlainObject(parsed)) return new Map();
  const keys = new Map<string, TrustedKey>();
  for (const [keyId, entry] of Object.entries(parsed)) {
    // A malformed entry means the key set is not what the owner thinks it is.
    // Dropping the WHOLE set is the fail-closed reading; keeping the valid
    // entries would let a typo silently reshape the trust root.
    if (!nonEmptyString(keyId) || !isPlainObject(entry)) return new Map();
    const { publicKey, criteria } = entry;
    if (!nonEmptyString(publicKey)) return new Map();
    if (
      !Array.isArray(criteria) ||
      criteria.length === 0 ||
      !criteria.every((id) => nonEmptyString(id))
    ) {
      return new Map();
    }
    keys.set(keyId, {
      publicKeyPem: publicKey,
      criteria: criteria as string[],
    });
  }
  return keys;
}

/**
 * Parse and shape-validate a receipt. Anything not fully interpretable is
 * rejected, including UNKNOWN FIELDS: an unrecognised key would sit inside the
 * signature but outside every binding check, which is exactly where a
 * meaningful-looking but unchecked claim would live.
 */
export function parseSignedReceipt(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "receipt must be valid JSON" };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, message: "receipt must be a JSON object" };
  }
  const extraTop = Object.keys(parsed).filter(
    (key) => !(SIGNED_FIELDS as readonly string[]).includes(key),
  );
  if (extraTop.length > 0) {
    return {
      ok: false,
      message: `receipt carries unrecognised fields: ${extraTop.sort().join(", ")}`,
    };
  }
  for (const field of ["keyId", "signature"] as const) {
    if (!nonEmptyString(parsed[field])) {
      return { ok: false, message: `receipt.${field} is required` };
    }
  }
  const receipt = parsed.receipt;
  if (!isPlainObject(receipt)) {
    return { ok: false, message: "receipt.receipt must be an object" };
  }
  const extra = Object.keys(receipt).filter(
    (key) => !(RECEIPT_FIELDS as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    return {
      ok: false,
      message: `receipt body carries unrecognised fields: ${extra.sort().join(", ")}`,
    };
  }
  for (const field of RECEIPT_FIELDS) {
    if (field === "measurements") continue;
    if (!nonEmptyString(receipt[field])) {
      return { ok: false, message: `receipt.${field} is required` };
    }
  }
  if (!isPlainObject(receipt.measurements)) {
    return { ok: false, message: "receipt.measurements must be an object" };
  }
  for (const [name, value] of Object.entries(receipt.measurements)) {
    const kind = typeof value;
    if (kind !== "string" && kind !== "number" && kind !== "boolean") {
      return {
        ok: false,
        message: `receipt.measurements.${name} must be a string, number or boolean`,
      };
    }
    if (kind === "number" && !Number.isFinite(value)) {
      return {
        ok: false,
        message: `receipt.measurements.${name} must be a finite number`,
      };
    }
  }
  return { ok: true, signed: parsed as unknown as SignedReleaseReceipt };
}

/**
 * Verify the Ed25519 signature over the receipt's CANONICAL bytes, recomputed
 * from the parsed object. Never over the raw file text: whitespace and key
 * order in a committed JSON file are not the signer's to control, and
 * verifying raw text would let a reformat break a valid receipt while leaving
 * room for two readings of the same bytes.
 */
export function verifyReceiptSignature(
  signed: SignedReleaseReceipt,
  publicKeyPem: string,
): boolean {
  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    return false;
  }
  if (publicKey.asymmetricKeyType !== "ed25519") return false;
  let canonical: string;
  try {
    canonical = canonicalJson(signed.receipt);
  } catch {
    return false;
  }
  try {
    return crypto.verify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(signed.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export interface ReceiptContext {
  criterionId: string;
  gateVersion: string;
  /** HEAD of this checkout. */
  releaseSha: string;
  /** Tree of HEAD, read from git by the caller. */
  releaseTree: string;
  /** `sha256:<hex>` recomputed from the evidence file's `## Evidence` body. */
  evidenceDigest: string;
  /** Same ceiling the evidence-file freshness rule uses. */
  maxAgeDays: number;
  /** Injected for deterministic tests. */
  now?: Date;
}

/**
 * Bind a signature-verified receipt to THIS scoring run.
 *
 * A valid signature says only that the key holder produced these bytes. Every
 * check here asks the separate question of whether the bytes describe the
 * commit being scored.
 */
export function checkReceiptBinding(
  receipt: ReleaseReceipt,
  context: ReceiptContext,
): ReceiptResult {
  if (receipt.criterionId !== context.criterionId) {
    return {
      ok: false,
      message: `receipt is bound to a different criterion (${receipt.criterionId})`,
    };
  }
  if (receipt.gateVersion !== context.gateVersion) {
    return {
      ok: false,
      message: `receipt was produced against gate version ${receipt.gateVersion}, scoring ${context.gateVersion}`,
    };
  }
  if (receipt.releaseSha.toLowerCase() !== context.releaseSha.toLowerCase()) {
    return {
      ok: false,
      message: `receipt is bound to a different release SHA (${receipt.releaseSha})`,
    };
  }
  // The tree is what a scan actually reads. Binding it as well as the commit
  // means a receipt cannot be carried across a rebase that preserves content
  // but changes the SHA, nor across a commit that reuses a SHA's message.
  if (receipt.releaseTree.toLowerCase() !== context.releaseTree.toLowerCase()) {
    return {
      ok: false,
      message: `receipt is bound to a different source tree (${receipt.releaseTree})`,
    };
  }
  if (
    receipt.evidenceDigest.toLowerCase() !== context.evidenceDigest.toLowerCase()
  ) {
    return {
      ok: false,
      message:
        "receipt evidence digest does not match the evidence file's ## Evidence section",
    };
  }
  const issuedAt = Date.parse(receipt.issuedAt);
  if (Number.isNaN(issuedAt)) {
    return { ok: false, message: "receipt issuedAt is not a valid timestamp" };
  }
  const now = (context.now ?? new Date()).getTime();
  if (issuedAt - now > MAX_RECEIPT_CLOCK_SKEW_MS) {
    return { ok: false, message: "receipt issuedAt is in the future" };
  }
  const ageDays = (now - issuedAt) / 86_400_000;
  if (ageDays > context.maxAgeDays) {
    return {
      ok: false,
      message: `receipt is stale: issued ${Math.round(ageDays)}d ago, max ${context.maxAgeDays}d`,
    };
  }
  return checkMeasurements(receipt, context);
}

type MeasurementCheck = (
  measurements: Record<string, string | number | boolean>,
  context: ReceiptContext,
) => ReceiptResult;

/** What a criterion requires of a receipt beyond a valid signature. */
interface CriterionPolicy {
  /**
   * Environments whose observation counts for this criterion. The receipt
   * carries `environment`; without this it would be carried and never
   * compared, which reads as a control while permitting anything.
   */
  environments: string[];
  check: MeasurementCheck;
}

/**
 * Assert a measurement is exactly the required count.
 *
 * @param measurements The receipt's measurement bag.
 * @param name Measurement to read.
 * @param expected The only value that passes.
 */
function requireCount(
  measurements: Record<string, string | number | boolean>,
  name: string,
  expected: number,
): ReceiptResult {
  const value = measurements[name];
  if (typeof value !== "number") {
    return { ok: false, message: `measurement ${name} must be a number` };
  }
  if (value !== expected) {
    return {
      ok: false,
      message: `measurement ${name} is ${value}, expected ${expected}`,
    };
  }
  return { ok: true };
}

/**
 * Criterion-specific policies.
 *
 * A criterion absent from this table CANNOT pass, however good its signature.
 * That is the point: a signature alone would make the gate a cryptographic
 * restatement of self-attestation — the owner's key would unlock the points
 * without anything having been measured. Enabling a criterion has to be a
 * deliberate act of writing down what "measured" means for it.
 */
export const CRITERION_POLICIES: Record<string, CriterionPolicy> = {
  "C2-secrets-scan": {
    // A secrets scan reads the tree, so it is reproducible on a CI runner and
    // has no business claiming to have been observed against production.
    environments: ["ci"],
    check: (measurements) => {
      for (const field of ["scanner", "scannerVersion", "scannedRef"] as const) {
        if (!nonEmptyString(measurements[field])) {
          return { ok: false, message: `measurement ${field} is required` };
        }
      }
      // CLAUDE.md: `gitleaks --no-git` ignores .gitignore, so a scan of the
      // working directory is not a scan of what ships. The receipt has to say
      // it read an export of the tracked tree, which is what CI scans.
      if (measurements.scannedRef !== "git-checkout-index") {
        return {
          ok: false,
          message:
            "measurement scannedRef must be git-checkout-index: a working-directory scan does not read the tracked tree",
        };
      }
      const findings = requireCount(measurements, "findings", 0);
      if (!findings.ok) return findings;
      // The env-var completeness half of C2. `/api/health` reports `degraded`
      // while any recommended variable is unset, so a secrets scan alone does
      // not settle this criterion.
      return requireCount(measurements, "missingEnvVars", 0);
    },
  },
};

/**
 * Full verification: parse, resolve the key, check that key is allowed to
 * speak for this criterion, verify the signature, then bind.
 *
 * Ordered so the cheapest and most specific rejections come first, and so a
 * signature is never checked against a key the caller did not vouch for.
 */
export function verifyReleaseReceipt(
  raw: string,
  context: ReceiptContext,
  trustedKeys: Map<string, TrustedKey>,
): ReceiptResult {
  if (trustedKeys.size === 0) {
    return {
      ok: false,
      message: `no trusted receipt keys configured (${TRUSTED_KEYS_ENV} is unset or malformed)`,
    };
  }
  const parsed = parseSignedReceipt(raw);
  if (!parsed.ok) return parsed;
  const key = trustedKeys.get(parsed.signed.keyId);
  if (!key) {
    return {
      ok: false,
      message: `receipt is signed by an untrusted key id (${parsed.signed.keyId})`,
    };
  }
  // Scope before signature. A key trusted for one criterion is not a key
  // trusted for the gate, and producers run in different places with different
  // blast radii -- one leaked key must not be able to satisfy everything.
  if (!key.criteria.includes(parsed.signed.receipt.criterionId)) {
    return {
      ok: false,
      message: `key ${parsed.signed.keyId} is not authorised to sign ${parsed.signed.receipt.criterionId}`,
    };
  }
  if (!verifyReceiptSignature(parsed.signed, key.publicKeyPem)) {
    return { ok: false, message: "receipt signature is invalid" };
  }
  return checkReceiptBinding(parsed.signed.receipt, context);
}

/**
 * Apply the criterion's policy: the environment it must have been observed in,
 * then its measurements.
 */
function checkMeasurements(
  receipt: ReleaseReceipt,
  context: ReceiptContext,
): ReceiptResult {
  const policy = CRITERION_POLICIES[receipt.criterionId];
  if (!policy) {
    return {
      ok: false,
      message: `no measurement policy is registered for ${receipt.criterionId}; a signature alone cannot earn release points`,
    };
  }
  if (!policy.environments.includes(receipt.environment)) {
    return {
      ok: false,
      message: `receipt was observed in ${receipt.environment}, which ${receipt.criterionId} does not accept`,
    };
  }
  return policy.check(receipt.measurements, context);
}
