/**
 * C2-secrets-scan producer: scans the tracked tree for secrets and reads
 * production's env-var completeness, emitting the measurements a signed
 * release receipt carries.
 *
 * WHY THIS IS SHAPED THE WAY IT IS
 * --------------------------------
 * `docs/evidence/release-gate/1.0.0/C2-secrets-scan.md` records how this
 * criterion held a PASS it had not earned, and each control below answers one
 * line of it.
 *
 *  1. **The instrument was blind.** The `.gitleaks.toml` this criterion rested
 *     on allowlisted `(?i)\.md$` -- every markdown file in the repository was
 *     exempt from every rule. The evidence file proves the consequence by
 *     measurement rather than argument: a secret-shaped value planted in a
 *     `.md` scanned as "no leaks found", and the identical scan with that one
 *     allowlist line removed caught it.
 *
 *     A scan that cannot see is indistinguishable from a clean tree, so this
 *     producer does not trust the scanner it is holding. It runs the scan
 *     twice: once over the real export, then again over the same export with a
 *     synthetic canary planted in a `.md`. If the second scan does not find the
 *     canary the instrument is broken, and the producer refuses to emit a
 *     measurement at all. `controlCanaryDetected` is carried in the receipt and
 *     pinned by the verifier, so the control cannot be quietly dropped later.
 *
 *  2. **`--no-git` ignores `.gitignore`.** CLAUDE.md states it outright: a scan
 *     of the working directory is not a scan of what ships. An untracked local
 *     `.env` sitting in the tree would be scanned (a false alarm), while the
 *     tracked content that actually deploys is what the criterion is about.
 *     So the scan runs over a `git checkout-index` export -- the tracked tree,
 *     nothing else -- and `scannedRef` records that. The verifier pins the
 *     value, so scanning something looser cannot be reported as this measurement.
 *
 *  3. **An empty scan finds nothing.** This is A3's defect in a different
 *     costume: a `checkout-index` export that produced no files would scan
 *     clean and read as a passing measurement, "in the way an unplugged smoke
 *     detector reports no smoke". `scannedFileCount` is reported and the
 *     verifier requires it to be positive.
 *
 *  4. **The env half cannot be measured on a runner.** `/api/health` reports
 *     `degraded` while any required or recommended variable is unset, which is
 *     the completeness signal this criterion wants -- but `getEnvStatus()`
 *     evaluated on a CI runner reads the RUNNER's environment, which says
 *     nothing about production and would fail for the wrong reason. So the
 *     producer reads it from production over the network and records
 *     `envSource`, pinned by the verifier: probing a sandbox or a preview host
 *     and reporting the answer as production's is exactly the substitution the
 *     pin exists to prevent.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not scan git history. A full-history scan currently reports findings
 * across files that have since been deleted; those are triaged in the evidence
 * document under RA-4985 and RA-4988, and gating on them here would make the
 * criterion red on arrival, which gets a gate disabled rather than fixed. The
 * criterion is about what ships.
 *
 * It also does not install gitleaks. The binary is provided by the caller, at
 * the version and checksum the workflow pins, so the instrument this producer
 * reports on is the reviewed one rather than whatever it could fetch at run
 * time.
 *
 * Usage:
 *   GITLEAKS_BINARY=/tmp/gitleaks npx tsx scripts/ci/producers/c2-secrets-scan.ts --json
 *
 * This script never signs: it has no access to the signing key and must not.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The tracked-tree export. Pinned by the verifier; see note 2 above. */
export const C2_SCANNED_REF = "git-checkout-index";

/** Production readiness endpoint. Pinned by the verifier; see note 4 above. */
export const C2_ENV_SOURCE = "https://restoreassist.app/api/health";

/** The scanner this criterion is defined in terms of. */
export const C2_SCANNER = "gitleaks";

/**
 * The control canary: a synthetic Stripe-shaped key, planted in a `.md`.
 *
 * Markdown on purpose. Markdown is where the blindness was, so the control has
 * to exercise that path or it re-proves the wrong thing. Stripe-shaped on
 * purpose too: the differential recorded in the evidence file used a
 * Stripe-shaped key in a `.md`, and `stripe-access-token` is a NAMED rule --
 * a canary caught only by the broad `generic-api-key` rule would prove less.
 *
 * Assembled at run time rather than written as a literal, which is not
 * cosmetic. This producer's own source file is INSIDE the tracked tree it
 * scans, so a literal here would be found by the real scan and `findings`
 * could never reach 0 -- the control would permanently fail the criterion it
 * exists to make trustworthy. Keeping the test material out of the material
 * under test is the whole reason for the seam.
 *
 * Verified against gitleaks 8.30.1 with this repository's `.gitleaks.toml`:
 * the assembled value is detected in a `.md`, and this source file scans
 * clean.
 *
 * The value is not a credential and never existed.
 */
export const C2_CANARY_PATH = "docs/c2-control-canary.md";

export function c2CanarySecret(): string {
  return ["sk", "live", "51H8xQ2KgTqLmNpRsTuVwXyZa1b2c3d4e"].join("_");
}

/** Assignment-shaped, because that is the form the scanner's rules match. */
export function c2CanaryDocument(): string {
  return `# C2 control canary\n\nNot a credential. Planted by the C2 producer to prove the\nscanner can see this path, then discarded with the export.\n\n    stripe_key = "${c2CanarySecret()}"\n`;
}

/** The measurement bag this producer emits, all values receipt-safe scalars. */
export interface C2Measurements {
  scanner: string;
  scannerVersion: string;
  scannedRef: string;
  scannedFileCount: number;
  findings: number;
  controlCanaryDetected: boolean;
  envSource: string;
  envStatus: string;
  missingEnvVars: number;
}

/** One gitleaks finding, reduced to the fields this producer reads. */
export interface GitleaksFinding {
  RuleID?: string;
  File?: string;
}

/**
 * Parse a gitleaks JSON report.
 *
 * gitleaks writes `null` rather than `[]` when it finds nothing, which is the
 * kind of detail that turns into a crash on the one run that matters. Handled
 * explicitly rather than with a `?? []` that would also swallow a malformed
 * report -- anything that is neither null nor an array is an error, not zero
 * findings.
 */
export function parseGitleaksReport(raw: string): GitleaksFinding[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null") return [];
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null) return [];
  if (!Array.isArray(parsed)) {
    throw new Error(
      "gitleaks report was neither null nor an array; refusing to read it as zero findings",
    );
  }
  return parsed as GitleaksFinding[];
}

/**
 * Read production's env-var completeness from a `/api/health` payload.
 *
 * `checks.env` is `ok`, `degraded` (recommended variables unset) or `error`
 * (required variables unset). `missing` carries the names. A payload without a
 * `checks.env` block is an error rather than a zero: an endpoint that does not
 * report the check has not told us the check passed.
 */
export function readEnvCompleteness(payload: unknown): {
  envStatus: string;
  missingEnvVars: number;
} {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("health payload is not an object");
  }
  const checks = (payload as { checks?: unknown }).checks;
  if (typeof checks !== "object" || checks === null) {
    throw new Error("health payload carries no checks block");
  }
  const env = (checks as { env?: unknown }).env;
  if (typeof env !== "object" || env === null) {
    throw new Error(
      "health payload carries no checks.env block; an endpoint that does not " +
        "report env completeness has not reported it as complete",
    );
  }
  const status = (env as { status?: unknown }).status;
  if (typeof status !== "string" || status === "") {
    throw new Error("health payload checks.env.status is not a string");
  }
  const missing = (env as { missing?: unknown }).missing;
  if (missing !== undefined && !Array.isArray(missing)) {
    throw new Error("health payload checks.env.missing is not an array");
  }
  return { envStatus: status, missingEnvVars: missing?.length ?? 0 };
}

/**
 * Reduce the two scans and the health probe to the receipt's measurements.
 *
 * Pure and separately tested: this is where a false pass would be born, and it
 * should not need a network round trip or a gitleaks binary to exercise.
 */
export function summariseC2(input: {
  scannerVersion: string;
  scannedFileCount: number;
  findings: GitleaksFinding[];
  controlFindings: GitleaksFinding[];
  envStatus: string;
  missingEnvVars: number;
}): C2Measurements {
  // The canary must be found BY PATH. Counting findings would pass if the
  // control scan merely returned more results than the real one for any
  // reason, which is a weaker claim than "the scanner read this file and
  // applied the rule".
  const controlCanaryDetected = input.controlFindings.some((finding) =>
    (finding.File ?? "").endsWith(C2_CANARY_PATH),
  );

  return {
    scanner: C2_SCANNER,
    scannerVersion: input.scannerVersion,
    scannedRef: C2_SCANNED_REF,
    scannedFileCount: input.scannedFileCount,
    findings: input.findings.length,
    controlCanaryDetected,
    envSource: C2_ENV_SOURCE,
    envStatus: input.envStatus,
    missingEnvVars: input.missingEnvVars,
  };
}

/** Count every file in the export, so an empty scan cannot read as clean. */
export async function countFiles(root: string): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).length;
}

function gitleaksBinary(): string {
  const binary = process.env.GITLEAKS_BINARY?.trim();
  if (!binary) {
    throw new Error(
      "GITLEAKS_BINARY is not set. This producer does not install its own " +
        "scanner: the workflow pins the version and checksum so the instrument " +
        "being reported on is the reviewed one.",
    );
  }
  return binary;
}

function gitleaksVersion(binary: string): string {
  // `gitleaks version` prints the bare version on stdout.
  const raw = execFileSync(binary, ["version"], { encoding: "utf8" }).trim();
  if (!raw) throw new Error("gitleaks reported no version");
  return raw;
}

/**
 * Scan one directory and return its findings.
 *
 * `--exit-code 0` because findings are the measurement, not a failure: this
 * producer reports what is there and lets the verifier decide. A non-zero exit
 * from gitleaks itself still throws, which is what we want -- a scanner that
 * crashed has not reported a clean tree.
 */
export function scanDirectory(
  binary: string,
  source: string,
  configPath: string,
  reportPath: string,
): GitleaksFinding[] {
  execFileSync(
    binary,
    [
      "detect",
      "--no-git",
      "--source",
      source,
      "--config",
      configPath,
      "--redact",
      "--no-banner",
      "--exit-code",
      "0",
      "--report-format",
      "json",
      "--report-path",
      reportPath,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return parseGitleaksReport(readFileSync(reportPath, "utf8"));
}

/** Export the tracked tree, which is what ships. See note 2. */
export function exportTrackedTree(destination: string): void {
  execFileSync("git", ["checkout-index", "-a", "-f", `--prefix=${destination}/`], {
    encoding: "utf8",
  });
}

async function fetchEnvCompleteness(
  url: string,
): Promise<{ envStatus: string; missingEnvVars: number }> {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  // A redirect is not an answer. Following one is how a probe of production
  // silently becomes a probe of whatever the redirect points at.
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `${url} redirected to ${response.headers.get("location") ?? "an unnamed target"}; ` +
        "refusing to read the redirect target as production",
    );
  }
  // 503 is a legitimate answer here: /api/health returns it when a check is in
  // `error`, and the body still carries the env block this criterion reads.
  if (!response.ok && response.status !== 503) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  return readEnvCompleteness(await response.json());
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting numbers on the command line.
 *
 * That indirection is the whole point. While the signer took a
 * `--measurements` argument, a key holder could certify `findings: 0` without
 * any scan happening, and every guard in the verifier would pass.
 */
export async function produceC2Measurements(): Promise<C2Measurements> {
  const binary = gitleaksBinary();
  const configPath = resolve(".gitleaks.toml");
  const workspace = mkdtempSync(join(tmpdir(), "c2-secrets-scan-"));

  try {
    const exportDir = join(workspace, "tree");
    exportTrackedTree(exportDir);
    const scannedFileCount = await countFiles(exportDir);
    if (scannedFileCount === 0) {
      throw new Error(
        "the tracked-tree export contained no files; refusing to report an " +
          "empty scan as a clean one",
      );
    }

    const findings = scanDirectory(
      binary,
      exportDir,
      configPath,
      join(workspace, "report.json"),
    );

    // The control. Plant the canary in the SAME export and rescan: if this does
    // not come back the scanner is not reading markdown, and the real scan's
    // silence means nothing.
    writeFileSync(join(exportDir, C2_CANARY_PATH), c2CanaryDocument());
    const controlFindings = scanDirectory(
      binary,
      exportDir,
      configPath,
      join(workspace, "control-report.json"),
    );

    const env = await fetchEnvCompleteness(C2_ENV_SOURCE);

    const measurements = summariseC2({
      scannerVersion: gitleaksVersion(binary),
      scannedFileCount,
      findings,
      controlFindings,
      ...env,
    });

    if (!measurements.controlCanaryDetected) {
      throw new Error(
        `the control canary planted at ${C2_CANARY_PATH} was NOT detected. ` +
          "The scanner is blind to that path -- almost certainly an over-broad " +
          "allowlist in .gitleaks.toml, which is the exact defect recorded in " +
          "docs/evidence/release-gate/1.0.0/C2-secrets-scan.md. Refusing to " +
          "report a scan this instrument cannot be trusted to have performed.",
      );
    }

    return measurements;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const measurements = await produceC2Measurements();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(measurements));
    return;
  }
  console.log(
    `Scanned ${measurements.scannedFileCount} tracked files with ` +
      `${measurements.scanner} ${measurements.scannerVersion}: ` +
      `${measurements.findings} findings (control canary detected).`,
  );
  console.log(
    `Production env completeness at ${measurements.envSource}: ` +
      `${measurements.envStatus}, ${measurements.missingEnvVars} variables unset.`,
  );
  if (measurements.findings > 0 || measurements.missingEnvVars > 0) {
    console.log(
      "C2 cannot pass while either count is above zero. Findings are triaged " +
        "in docs/evidence/release-gate/1.0.0/C2-secrets-scan.md; unset " +
        "variables are listed by /api/health.",
    );
  }
}

// Only run when invoked directly, so the pure exports stay importable.
if (process.argv[1]?.endsWith("c2-secrets-scan.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
