/**
 * Fail when a deployed database's migration ledger does not match
 * prisma/migrations in this checkout (RA-7939, from RA-7938).
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * On 8 Oct 2026 sandbox sign-up and login returned 500 because the sandbox
 * database never received `20260825134000_pending_invite_identity`. Build and
 * start are non-mutating on purpose, and the only parity gate
 * (scripts/verify-production-migrations.sh) covers production and needs a
 * direct database URL. Nothing told anyone the sandbox was behind.
 *
 * The public `/api/health/migrations` route already publishes the applied
 * count and a fingerprint of the applied migration names. This script
 * fingerprints the repo's migration folders with the same algorithm
 * (expectedMigrationLedger, one home for it) and compares the two. It needs no
 * credentials, sends no writes, and runs no migrations.
 *
 *   node scripts/ci/check-migration-ledger-parity.mjs https://restoreassist.app
 *   node scripts/ci/check-migration-ledger-parity.mjs https://restoreassist-sandbox.vercel.app --allow-ahead
 *
 * Exit 0 = the deployed ledger matches this checkout exactly, or (only with
 *          --allow-ahead) it is a clean ledger with MORE applied migrations
 *          than this checkout, reported as a WARN line.
 * Exit 1 = reachable, but drifted: status not ok, or count or fingerprint differs.
 * Exit 2 = could not check (no target, network error, non-JSON, bad arguments).
 *          Never a pass, with or without --allow-ahead.
 *
 * --allow-ahead (RA-8386) is for the sandbox, where branch migrations are
 * applied by hand before they merge, so the sandbox can be ahead of main by
 * design. Behind still fails: that is the 8 Oct fault above. The public route
 * publishes only a count and a whole-ledger fingerprint, so "ahead" means a
 * larger clean count; it cannot prove every migration in this checkout is
 * among those applied, and the warning says so. Production never passes the
 * flag: ahead or behind, it must match exactly.
 *
 * Output is counts and PASS/WARN/FAIL only. Fingerprints are never printed.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expectedMigrationLedger } from "./expected-migration-ledger.mjs";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const EXIT = Object.freeze({ PASS: 0, DRIFT: 1, UNCHECKED: 2 });

const VERDICT_BY_CODE = {
  [EXIT.PASS]: "pass",
  [EXIT.DRIFT]: "drift",
  [EXIT.UNCHECKED]: "unchecked",
};

/**
 * Compare a parsed health response with the repo's expected ledger.
 * Returns { code, verdict, reason, repoCount, appliedCount[, aheadBy] }; never
 * includes a fingerprint. verdict is "pass", "ahead", "drift" or "unchecked".
 * "ahead" (code PASS) is only possible when allowAhead is exactly true.
 */
export function compareLedger(httpStatus, payload, expected, { allowAhead = false } = {}) {
  const result = compareLedgerCodes(httpStatus, payload, expected, allowAhead === true);
  return { verdict: VERDICT_BY_CODE[result.code], ...result };
}

function compareLedgerCodes(httpStatus, payload, expected, allowAhead) {
  const repoCount = expected.count;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      code: EXIT.UNCHECKED,
      reason: `HTTP ${httpStatus} with no JSON object body`,
      repoCount,
      appliedCount: null,
    };
  }
  const counts = payload.counts && typeof payload.counts === "object" ? payload.counts : null;
  const appliedCount = Number.isInteger(counts?.total) ? counts.total : null;
  if (payload.status === undefined && httpStatus !== 200) {
    // Not the health route speaking (rate limit, proxy or platform error page).
    return {
      code: EXIT.UNCHECKED,
      reason: `HTTP ${httpStatus} without a migration health status`,
      repoCount,
      appliedCount,
    };
  }
  if (payload.status !== "ok" || httpStatus !== 200) {
    const detail = typeof payload.error === "string" ? `: ${payload.error}` : "";
    return {
      code: EXIT.DRIFT,
      reason: `health reports ${JSON.stringify(payload.status ?? null)} (HTTP ${httpStatus})${detail}`,
      repoCount,
      appliedCount,
    };
  }
  if (
    !counts ||
    !Number.isInteger(counts.applied) ||
    counts.failed !== 0 ||
    counts.rolled_back !== 0 ||
    counts.applied !== counts.total
  ) {
    return {
      code: EXIT.DRIFT,
      reason: "health counts do not show a clean, fully applied ledger",
      repoCount,
      appliedCount,
    };
  }
  const fingerprint = payload.migrationLedgerFingerprint;
  const validFingerprint = typeof fingerprint === "string" && SHA256_HEX.test(fingerprint);
  if (allowAhead && validFingerprint && appliedCount > repoCount) {
    const aheadBy = appliedCount - repoCount;
    return {
      code: EXIT.PASS,
      verdict: "ahead",
      aheadBy,
      reason:
        `applied ${appliedCount} migrations, repo has ${repoCount} (${aheadBy} ahead); ` +
        "the public route cannot confirm every repo migration is among them",
      repoCount,
      appliedCount,
    };
  }
  if (appliedCount !== repoCount) {
    return {
      code: EXIT.DRIFT,
      reason: `applied ${appliedCount} migrations, repo has ${repoCount}`,
      repoCount,
      appliedCount,
    };
  }
  if (!validFingerprint) {
    return {
      code: EXIT.DRIFT,
      reason: "health response carries no valid ledger fingerprint",
      repoCount,
      appliedCount,
    };
  }
  if (fingerprint !== expected.fingerprint) {
    return {
      code: EXIT.DRIFT,
      reason: "same count, but the applied migration names differ from the repo",
      repoCount,
      appliedCount,
    };
  }
  return { code: EXIT.PASS, reason: "ledger matches the repo", repoCount, appliedCount };
}

/** Normalise the operator-supplied origin and build the probe URL. */
export function healthUrl(base) {
  if (typeof base !== "string" || base.trim() === "") {
    throw new Error("a target origin is required, e.g. https://restoreassist.app");
  }
  const origin = new URL(base.trim());
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error(`unsupported protocol ${origin.protocol}`);
  }
  return new URL("/api/health/migrations", origin.origin).toString();
}

function unchecked(reason, repoCount = null) {
  return { code: EXIT.UNCHECKED, verdict: "unchecked", reason, repoCount, appliedCount: null };
}

export async function checkMigrationLedgerParity(
  base,
  {
    fetchImpl = globalThis.fetch,
    root = process.cwd(),
    timeoutMs = 20_000,
    allowAhead = false,
  } = {},
) {
  let url;
  let expected;
  try {
    url = healthUrl(base);
    expected = expectedMigrationLedger(root);
  } catch (error) {
    return unchecked(error.message);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "cache-control": "no-store" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unchecked(`request failed: ${error?.name ?? "Error"}`, expected.count);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return compareLedger(response.status, payload, expected, { allowAhead });
}

const OPTIONS = new Set(["--allow-ahead"]);

/** Exactly one target origin plus known options; anything else is refused. */
export function parseArgs(args) {
  const targets = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && !OPTIONS.has(arg));
  if (unknown.length > 0) return { error: `unknown option ${unknown[0]}` };
  if (targets.length > 1) return { error: "exactly one target origin is allowed" };
  return { base: targets[0], allowAhead: args.includes("--allow-ahead") };
}

export async function main(argv) {
  const parsed = parseArgs(argv.slice(2));
  const base = parsed.base ?? argv[2];
  const result = parsed.error
    ? unchecked(parsed.error)
    : await checkMigrationLedgerParity(parsed.base, { allowAhead: parsed.allowAhead });
  const label =
    result.verdict === "ahead"
      ? "WARN (ahead)"
      : { 0: "PASS", 1: "FAIL (drift)", 2: "FAIL (could not check)" }[result.code];
  const target = (() => {
    try {
      return new URL(base).origin;
    } catch {
      return String(base ?? "(none)");
    }
  })();
  const line =
    `[migration-ledger-parity] ${label} ${target}: ${result.reason}` +
    ` (repo ${result.repoCount ?? "?"}, applied ${result.appliedCount ?? "?"})`;
  if (result.code === EXIT.PASS) console.log(line);
  else console.error(line);
  if (result.verdict === "ahead" && process.env.GITHUB_ACTIONS === "true") {
    // A visible annotation on the run summary, without turning the job red.
    console.log(`::warning title=Migration ledger ahead::${target}: ${result.reason}`);
  }
  return result.code;
}


