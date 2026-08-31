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
import { A3_EXPECTED_VIEWER_ID } from "./producers/a3-open-blockers";
import {
  C2_ENV_SOURCE,
  C2_SCANNED_REF,
} from "./producers/c2-secrets-scan";
import {
  F1_REPOSITORY,
  F1_REQUIRED_CLASSES,
} from "./producers/f1-monitoring-alerting";
import {
  A1_BASE_URL,
  A1_JOURNEY_STEPS,
} from "./producers/a1-core-journeys";
import {
  D1_IOS_GUARD,
  D1_LIFECYCLE,
} from "./producers/d1-billing-flows";

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
  /** Where the producer actually ran. See `checkProvenance`. */
  provenance: ReceiptProvenance;
}

/**
 * Identifies the CI run that produced the measurements.
 *
 * This exists because a signature alone proves only that a key holder produced
 * the bytes. Before provenance, `sign-release-receipt.ts` accepted a
 * `--measurements` argument and signed whatever it was handed, so a key holder
 * could certify `openBlockerCount: 0` without any producer ever running --
 * self-attestation with a signature on it, which is the exact thing the receipt
 * scheme exists to replace. Found by CodeRabbit reviewing #2109 retrospectively.
 *
 * The signer no longer accepts measurements at all; it invokes the registered
 * producer itself. These fields record where that happened.
 */
export interface ReceiptProvenance {
  /** `GITHUB_REPOSITORY`. */
  repository: string;
  /** `GITHUB_WORKFLOW_REF`, e.g. `owner/repo/.github/workflows/x.yml@refs/heads/main`. */
  workflowRef: string;
  /** `GITHUB_RUN_ID`, for auditing back to the run and its logs. */
  runId: string;
  /** `GITHUB_RUN_ATTEMPT`. */
  runAttempt: string;
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
  "provenance",
] as const;

/**
 * The workflow permitted to mint receipts, and the ref it must run from.
 *
 * Pinning both is what makes provenance mean something offline. The scorer
 * cannot call GitHub to confirm a run happened, but it CAN refuse a receipt
 * that does not claim to come from this workflow on the default branch --
 * which, combined with the signing key living only in that workflow's
 * environment, is what closes the gap.
 */
export const RECEIPT_WORKFLOW_PATH = ".github/workflows/release-receipt.yml";
export const RECEIPT_WORKFLOW_REF = "refs/heads/main";

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
    if (field === "measurements" || field === "provenance") continue;
    if (!nonEmptyString(receipt[field])) {
      return { ok: false, message: `receipt.${field} is required` };
    }
  }
  if (!isPlainObject(receipt.provenance)) {
    return { ok: false, message: "receipt.provenance must be an object" };
  }
  const provenanceFields = ["repository", "workflowRef", "runId", "runAttempt"];
  const extraProvenance = Object.keys(receipt.provenance).filter(
    (key) => !provenanceFields.includes(key),
  );
  if (extraProvenance.length > 0) {
    return {
      ok: false,
      message: `receipt.provenance carries unrecognised fields: ${extraProvenance.sort().join(", ")}`,
    };
  }
  for (const field of provenanceFields) {
    if (!nonEmptyString(receipt.provenance[field])) {
      return { ok: false, message: `receipt.provenance.${field} is required` };
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
  /**
   * `GITHUB_REPOSITORY` when the scorer runs in CI. Left undefined locally,
   * where there is nothing trustworthy to compare against.
   */
  repository?: string;
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
  const provenance = checkProvenance(receipt, context);
  if (!provenance.ok) return provenance;

  return checkMeasurements(receipt, context);
}

/**
 * Require the receipt to have been minted by the protected workflow.
 *
 * The scorer runs offline and cannot ask GitHub whether a run happened, so this
 * is not proof on its own. It is one half of a pair: the signing key lives only
 * in that workflow's environment, so a valid signature already implies the
 * workflow. Pinning the workflow path and ref here means a receipt cannot be
 * minted by some OTHER workflow that later gains access to the same
 * environment, and cannot be minted from a pull-request branch where the file
 * can be edited by whoever opened the PR.
 *
 * That last point is the one that matters most: `pull_request` runs must never
 * reach these secrets, and a receipt claiming a non-main ref is the signature
 * of someone trying.
 */
export function checkProvenance(
  receipt: ReleaseReceipt,
  context: ReceiptContext,
): ReceiptResult {
  const { repository, workflowRef } = receipt.provenance;
  if (context.repository && repository !== context.repository) {
    return {
      ok: false,
      message: `receipt was produced in a different repository (${repository})`,
    };
  }
  // Shape: owner/repo/.github/workflows/file.yml@ref
  const [path, ref] = workflowRef.split("@");
  if (!ref) {
    return {
      ok: false,
      message: `receipt provenance workflowRef is malformed (${workflowRef})`,
    };
  }
  if (!path.endsWith(RECEIPT_WORKFLOW_PATH)) {
    return {
      ok: false,
      message: `receipt was minted by ${path}, not ${RECEIPT_WORKFLOW_PATH}`,
    };
  }
  if (ref !== RECEIPT_WORKFLOW_REF) {
    return {
      ok: false,
      message: `receipt was minted from ${ref}, not ${RECEIPT_WORKFLOW_REF}: a receipt from a pull-request branch is not evidence, because that branch can edit the workflow`,
    };
  }
  return { ok: true };
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
      if (measurements.scannedRef !== C2_SCANNED_REF) {
        return {
          ok: false,
          message:
            `measurement scannedRef must be ${C2_SCANNED_REF}: a working-directory scan does not read the tracked tree`,
        };
      }
      // An empty scan finds nothing. A checkout-index export that produced no
      // files would scan clean and read as a pass -- A3's unplugged smoke
      // detector, in a different costume.
      const scanned = measurements.scannedFileCount;
      if (typeof scanned !== "number" || !Number.isInteger(scanned) || scanned <= 0) {
        return {
          ok: false,
          message:
            "measurement scannedFileCount must be a positive integer: a scan that read no files has not reported a clean tree",
        };
      }
      // The instrument's own control. C2 previously rested on a .gitleaks.toml
      // that allowlisted every markdown file, so the scan could not have
      // detected a secret committed to one and reported "no leaks found"
      // regardless. The producer plants a canary in a .md and rescans; without
      // that proof a findings count of 0 means nothing.
      if (measurements.controlCanaryDetected !== true) {
        return {
          ok: false,
          message:
            "measurement controlCanaryDetected must be true: a scanner not proven able to see the file it scanned cannot report a clean tree",
        };
      }
      const findings = requireCount(measurements, "findings", 0);
      if (!findings.ok) return findings;
      // The env-var completeness half of C2. `/api/health` reports `degraded`
      // while any recommended variable is unset, so a secrets scan alone does
      // not settle this criterion.
      //
      // Pinned to production. `getEnvStatus()` on a CI runner reads the
      // RUNNER's environment, and a sandbox or preview host answers a
      // different question than the one this criterion asks -- so the receipt
      // has to say which host it read, and only one host counts.
      if (measurements.envSource !== C2_ENV_SOURCE) {
        return {
          ok: false,
          message:
            `measurement envSource must be ${C2_ENV_SOURCE}: env completeness read anywhere else is not production's`,
        };
      }
      return requireCount(measurements, "missingEnvVars", 0);
    },
  },

  "F1-monitoring-alerting": {
    // Reads the GitHub API for workflow runs and repository labels, so it is
    // reproducible on a runner and has no business claiming production.
    environments: ["ci"],
    check: (measurements) => {
      if (measurements.source !== "github-actions") {
        return { ok: false, message: "measurement source must be github-actions" };
      }
      if (measurements.repository !== F1_REPOSITORY) {
        return {
          ok: false,
          message: `measurement repository must be ${F1_REPOSITORY}`,
        };
      }
      // Population control. Zero declared checks would report zero failing and
      // zero stale, and read as fully healthy monitoring -- A3's query that
      // reached nothing, one criterion over.
      const declared = measurements.checksDeclared;
      if (typeof declared !== "number" || !Number.isInteger(declared) || declared <= 0) {
        return {
          ok: false,
          message:
            "measurement checksDeclared must be a positive integer: no declared checks is not healthy monitoring",
        };
      }
      if (measurements.checksHealthy !== declared) {
        return {
          ok: false,
          message: `only ${measurements.checksHealthy} of ${declared} production checks are healthy`,
        };
      }
      // Stated separately from the count so the receipt says WHICH, and so a
      // check that is red and a check that stopped firing stay distinguishable.
      for (const field of ["failingChecks", "staleChecks"] as const) {
        if (measurements[field] !== "") {
          return {
            ok: false,
            message: `measurement ${field} is not empty: ${measurements[field]}`,
          };
        }
      }
      // The alerting half, and the hole it would otherwise leave open.
      //
      // A repository with NO failure notifier at all reports zero missing
      // labels, which passes a bare emptiness check while alerting on nothing.
      // So the receipt must show that notifiers exist before it can show that
      // their labels resolve.
      if (
        typeof measurements.notifierLabelsDeclared !== "string" ||
        measurements.notifierLabelsDeclared === ""
      ) {
        return {
          ok: false,
          message:
            "measurement notifierLabelsDeclared is empty: a repository with no failure notifier is not alerting",
        };
      }
      // The eight-week failure. `gh issue create` rejects a non-existent
      // label, so a notifier naming one fails and files nothing -- an alarm
      // wired to a bell that was never installed.
      if (measurements.missingNotifierLabels !== "") {
        return {
          ok: false,
          message: `notifier labels do not exist, so those alarms cannot fire: ${measurements.missingNotifierLabels}`,
        };
      }
      // The criterion names three failure classes, and all three must be
      // watched. Comparing against the required list rather than trusting
      // `uncoveredClasses` to be empty, so a producer that simply stopped
      // reporting a class cannot pass by omission.
      if (measurements.requiredClasses !== [...F1_REQUIRED_CLASSES].join(",")) {
        return {
          ok: false,
          message: "measurement requiredClasses does not match the criterion's classes",
        };
      }
      if (measurements.coveredClasses !== measurements.requiredClasses) {
        return {
          ok: false,
          message: `no alert covers: ${measurements.uncoveredClasses || "(unreported)"}`,
        };
      }
      return { ok: true };
    },
  },

  "D1-billing-flows": {
    // Stripe TEST mode plus a read of this repository's routes: both
    // reproducible on a runner, and neither is an observation of production.
    environments: ["ci"],
    check: (measurements) => {
      if (measurements.source !== "stripe+repo") {
        return { ok: false, message: "measurement source must be stripe+repo" };
      }
      // Pinned to test mode. The walk creates subscriptions and cancels them;
      // the evidence file is explicit that it must never run against prod
      // Stripe, and a live-key run would charge real cards. Reconciling live
      // revenue is D3's job, not this one.
      if (measurements.mode !== "test") {
        return {
          ok: false,
          message: `D1 is a test-mode walk; observed mode ${JSON.stringify(measurements.mode)}`,
        };
      }
      // Compared against the criterion's own stage list rather than trusting
      // missingStages to be empty, so a producer that stopped reporting a
      // stage cannot pass by omission.
      if (measurements.lifecycleStages !== [...D1_LIFECYCLE].join(",")) {
        return {
          ok: false,
          message: "measurement lifecycleStages does not match the criterion's stages",
        };
      }
      if (measurements.missingStages !== "") {
        return {
          ok: false,
          message: `lifecycle stages never observed: ${measurements.missingStages}`,
        };
      }
      // Population control on the route scan. Zero discovered routes reports
      // zero unguarded and zero unclassified, and reads as a fully guarded
      // application -- A3's query that reached nothing, one criterion over.
      const scanned = measurements.billingRoutesScanned;
      if (typeof scanned !== "number" || !Number.isInteger(scanned) || scanned <= 0) {
        return {
          ok: false,
          message:
            "measurement billingRoutesScanned must be a positive integer: a scan that found no billing routes has not verified any",
        };
      }
      const guarded = measurements.guardedRoutes;
      if (typeof guarded !== "number" || guarded <= 0) {
        return {
          ok: false,
          message:
            "measurement guardedRoutes must be positive: an application where nothing rejects iOS is not enforcing Path B",
        };
      }
      if (measurements.iosGuard !== D1_IOS_GUARD) {
        return {
          ok: false,
          message: `measurement iosGuard must be ${D1_IOS_GUARD}`,
        };
      }
      // The regression this half exists for: a new checkout route that nobody
      // guarded and nobody classified.
      if (measurements.unclassifiedBillingRoutes !== "") {
        return {
          ok: false,
          message: `billing routes neither guarded nor classified: ${measurements.unclassifiedBillingRoutes}`,
        };
      }
      // The scope-out has to stay true. If StoreKit or an IAP library ever
      // lands, "Apple IAP is not applicable" stops being a fact and this
      // criterion must be rethought rather than quietly measuring Stripe alone.
      if (measurements.appleIapShipped !== false) {
        return {
          ok: false,
          message:
            "Apple IAP appears to ship: the RA-1842 Path B scope-out no longer holds and D1 must be re-scoped",
        };
      }
      return { ok: true };
    },
  },

  "A1-core-journeys": {
    // Observed against a deployed sandbox, not a runner. The journey signs up
    // companies and pushes an invoice; "ci" would mean it ran against nothing
    // deployed, and "production" would mean creating customer-visible records
    // on every gate run.
    environments: ["sandbox"],
    check: (measurements, context) => {
      if (measurements.source !== "playwright") {
        return { ok: false, message: "measurement source must be playwright" };
      }
      if (measurements.baseUrl !== A1_BASE_URL) {
        return {
          ok: false,
          message: `measurement baseUrl must be ${A1_BASE_URL}`,
        };
      }
      // THE A1 CONTROL. "Independently verified on this SHA" is the criterion's
      // own wording, and a green journey against a different build is evidence
      // about that build. Production served a revision older than its own
      // deploymentSha field for weeks, so this is a failure that has actually
      // happened here rather than a hypothetical one.
      const observed = measurements.deploymentSha;
      if (
        typeof observed !== "string" ||
        observed.toLowerCase() !== context.releaseSha.toLowerCase()
      ) {
        return {
          ok: false,
          message: `journey ran against ${JSON.stringify(observed)}, not the release SHA ${context.releaseSha}`,
        };
      }
      // Playwright exits 0 when it matches no tests, so "0 failures" and "ran
      // nothing" are the same exit code. Both halves are needed: a positive
      // count proves something ran, and an empty missing-list proves the
      // things that ran were the declared ones.
      const executed = measurements.testsExecuted;
      if (typeof executed !== "number" || !Number.isInteger(executed) || executed <= 0) {
        return {
          ok: false,
          message:
            "measurement testsExecuted must be a positive integer: a run that executed nothing is not a verified journey",
        };
      }
      if (measurements.specsMissingFromReport !== "") {
        return {
          ok: false,
          message: `declared specs did not run: ${measurements.specsMissingFromReport}`,
        };
      }
      if (
        typeof measurements.specsDeclared !== "string" ||
        measurements.specsDeclared === ""
      ) {
        return {
          ok: false,
          message:
            "measurement specsDeclared is empty: a coverage map naming no specs verifies nothing",
        };
      }
      if (measurements.failingSpecs !== "") {
        return {
          ok: false,
          message: `specs failed: ${measurements.failingSpecs}`,
        };
      }
      // Pinned against the criterion's own step list rather than trusting
      // uncoveredSteps to be empty, so a producer that stopped reporting a step
      // cannot pass by omission.
      if (measurements.journeySteps !== [...A1_JOURNEY_STEPS].join(",")) {
        return {
          ok: false,
          message: "measurement journeySteps does not match the criterion's steps",
        };
      }
      if (measurements.coveredSteps !== measurements.journeySteps) {
        return {
          ok: false,
          message: `journey steps not verified: ${measurements.uncoveredSteps || "(unreported)"}`,
        };
      }
      return { ok: true };
    },
  },

  "A3-no-sev1-sev2-open": {
    // A Linear query, so it runs on a runner with an API key, not against
    // production.
    environments: ["ci"],
    check: (measurements) => {
      // Every check here answers a specific line of
      // docs/evidence/release-gate/1.0.0/A3-no-sev1-sev2-open.md, which
      // records how this criterion scored 5 points it had not earned.
      if (measurements.source !== "linear") {
        return { ok: false, message: "measurement source must be linear" };
      }
      if (measurements.teamKey !== "RA") {
        return {
          ok: false,
          message: `measurement teamKey is ${String(measurements.teamKey)}, expected RA`,
        };
      }
      // The prior query scanned only `state = started`, so anything in triage,
      // backlog or unstarted was invisible while being open by any reading.
      // Pinning the set means a narrowing cannot be silent.
      if (measurements.stateTypesScanned !== "backlog,started,triage,unstarted") {
        return {
          ok: false,
          message:
            "measurement stateTypesScanned must cover every open state type (backlog,started,triage,unstarted)",
        };
      }
      if (measurements.prioritiesScanned !== "1,2") {
        return {
          ok: false,
          message:
            "measurement prioritiesScanned must be 1,2: Urgent alone does not answer this criterion",
        };
      }
      // Exclusions can drive any count to zero, so the permitted set is pinned
      // here rather than left to the producer. Widening it is a reviewed code
      // change; RA-2232 is the verdict that put these two out of scope.
      if (measurements.excludedProjects !== "Margot,Pi-Dev-Ops") {
        return {
          ok: false,
          message:
            "measurement excludedProjects must be exactly Margot,Pi-Dev-Ops per RA-2232",
        };
      }
      // The unplugged-smoke-detector guard. The prior PASS came from a query
      // naming a project that did not exist: Linear answered "Could not find
      // project" and the empty result read as zero blockers. A query that
      // reached nothing must not look like a team with nothing wrong.
      const population = measurements.populationCount;
      if (typeof population !== "number" || population <= 0) {
        return {
          ok: false,
          message:
            "measurement populationCount must be positive: a query that matched no issues at all is an absent measurement, not a passing one",
        };
      }
      // Linear personal keys see only what their user sees, so a narrowed key
      // reports a healthy population while omitting private-team blockers.
      // populationCount cannot detect that; pinning the identity can.
      // Substantive failures first: "you have 12 open blockers" is more
      // actionable than a configuration message, and a run with real blockers
      // fails either way. The identity gate is last because it decides whether
      // a CLEAN result can be believed.
      const blockers = requireCount(measurements, "openBlockerCount", 0);
      if (!blockers.ok) return blockers;
      return checkA3Viewer(measurements.viewerId);
    },
  },

  "D3-revenue-reconciliation": {
    // Real revenue, so the observation is of production: live Stripe against
    // the production database. A CI-mode reconciliation would be test data.
    environments: ["production"],
    check: (measurements, context) => {
      if (measurements.source !== "stripe+prisma") {
        return { ok: false, message: "measurement source must be stripe+prisma" };
      }
      // Test-mode events are not revenue. The evidence file says live mode
      // explicitly, and the producer reads this from the key prefix rather
      // than accepting a declaration.
      if (measurements.mode !== "live") {
        return {
          ok: false,
          message: `measurement mode is ${String(measurements.mode)}; only live Stripe events are revenue`,
        };
      }
      if (measurements.windowDays !== 7) {
        return {
          ok: false,
          message: "measurement windowDays must be 7",
        };
      }
      if (
        measurements.eventTypesScanned !==
        "customer.subscription.created,customer.subscription.deleted,customer.subscription.updated,invoice.payment_failed"
      ) {
        return {
          ok: false,
          message:
            "measurement eventTypesScanned must cover all four reconciled Stripe types",
        };
      }
      // A window chosen freely is a window that can be shopped for: some
      // earlier seven days where the two sides happened to agree. It has to be
      // the week ending about now, held to the same freshness rule as the
      // receipt itself.
      const windowEnd = Date.parse(String(measurements.windowEndsAt));
      if (Number.isNaN(windowEnd)) {
        return { ok: false, message: "measurement windowEndsAt is not a timestamp" };
      }
      const windowAgeDays =
        ((context.now ?? new Date()).getTime() - windowEnd) / 86_400_000;
      if (windowAgeDays > context.maxAgeDays || windowAgeDays < -1) {
        return {
          ok: false,
          message: `measurement window ends ${Math.round(windowAgeDays)}d from now; it must be the current window, not an earlier one that happened to reconcile`,
        };
      }
      // The trap the evidence file names outright: "0 events on both sides
      // reconciles, but it does NOT prove the pipeline works; it only proves
      // nothing happened." Two empty queries agreeing is an absent
      // measurement, not a passing one.
      const stripeCount = measurements.stripeEventCount;
      if (typeof stripeCount !== "number" || stripeCount <= 0) {
        return {
          ok: false,
          message:
            "measurement stripeEventCount must be positive: a window with no Stripe events reconciles trivially and proves nothing about the pipeline",
        };
      }
      // Equal totals are weak -- five events on each side can be five
      // DIFFERENT events, which is what a partially-failing webhook produces.
      // Every Stripe event must have its own row.
      const missing = requireCount(measurements, "missingInDb", 0);
      if (!missing.ok) return missing;
      if (measurements.matchedInDb !== stripeCount) {
        return {
          ok: false,
          message: `measurement matchedInDb (${String(measurements.matchedInDb)}) does not equal stripeEventCount (${stripeCount})`,
        };
      }
      // Q4 in the evidence file: the @unique constraint should make this
      // impossible, and running it is how you learn the constraint still works.
      const duplicates = requireCount(measurements, "duplicateStripeIds", 0);
      if (!duplicates.ok) return duplicates;
      // Anything Stripe-originated carries an event id, so a row without one
      // means something other than the webhook is writing revenue events.
      const unlinked = requireCount(measurements, "dbEventsWithoutStripeId", 0);
      if (!unlinked.ok) return unlinked;
      // The webhook half, now actually measured. This was
      // `failedWebhookDeliveries`, supplied by the caller and defaulted to -1
      // so an unmeasured value would fail rather than pass silently. The
      // producer derives it from Stripe's `pending_webhooks`, so the field can
      // no longer be asserted at all.
      //
      // Named narrowly on purpose. `pending_webhooks` counts deliveries not yet
      // successful AT READ TIME, so an event that failed twice then succeeded
      // reports 0. That is not the dashboard's "failed deliveries over 7 days",
      // and calling it that would be a claim the measurement cannot support.
      // What it does catch is a delivery still outstanding when the two sides
      // were compared -- a row that is not there yet and may never arrive.
      return requireCount(measurements, "undeliveredWebhookEvents", 0);
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
 * Pin the Linear identity that took the A3 measurement.
 *
 * Linear personal keys see only what their user sees and can be narrowed to
 * particular teams, so a narrowed key reports a healthy `populationCount` while
 * omitting exactly the private-team blockers the criterion is about. A count
 * cannot detect that; an identity can.
 *
 * `expected` is injectable so the unset and mismatched cases are both testable
 * without editing a constant.
 *
 * @param viewerId The `viewer.id` the producer observed.
 * @param expected The configured service identity; empty means unconfigured.
 */
export function checkA3Viewer(
  viewerId: string | number | boolean | undefined,
  expected: string = A3_EXPECTED_VIEWER_ID,
): ReceiptResult {
  if (!expected) {
    return {
      ok: false,
      message:
        "A3 cannot pass until A3_EXPECTED_VIEWER_ID names a Linear service identity with verified read access across team RA: without it, nothing establishes that the querying key can see every issue this criterion is about",
    };
  }
  if (viewerId !== expected) {
    return {
      ok: false,
      message: `measurement viewerId is not the expected Linear service identity (${String(viewerId)})`,
    };
  }
  return { ok: true };
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
