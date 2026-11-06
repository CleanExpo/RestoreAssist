#!/usr/bin/env node
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
 *
 * Exit 0 = the deployed ledger matches this checkout exactly.
 * Exit 1 = reachable, but drifted: status not ok, or count or fingerprint differs.
 * Exit 2 = could not check (no target, network error, non-JSON). Never a pass.
 *
 * Output is counts and PASS/FAIL only. Fingerprints are never printed.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expectedMigrationLedger } from "./expected-migration-ledger.mjs";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const EXIT = Object.freeze({ PASS: 0, DRIFT: 1, UNCHECKED: 2 });

/**
 * Compare a parsed health response with the repo's expected ledger.
 * Returns { code, reason, repoCount, appliedCount }; never includes a fingerprint.
 */
export function compareLedger(httpStatus, payload, expected) {
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
  if (appliedCount !== repoCount) {
    return {
      code: EXIT.DRIFT,
      reason: `applied ${appliedCount} migrations, repo has ${repoCount}`,
      repoCount,
      appliedCount,
    };
  }
  const fingerprint = payload.migrationLedgerFingerprint;
  if (typeof fingerprint !== "string" || !SHA256_HEX.test(fingerprint)) {
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

export async function checkMigrationLedgerParity(
  base,
  { fetchImpl = globalThis.fetch, root = process.cwd(), timeoutMs = 20_000 } = {},
) {
  let url;
  let expected;
  try {
    url = healthUrl(base);
    expected = expectedMigrationLedger(root);
  } catch (error) {
    return { code: EXIT.UNCHECKED, reason: error.message, repoCount: null, appliedCount: null };
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "cache-control": "no-store" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      code: EXIT.UNCHECKED,
      reason: `request failed: ${error?.name ?? "Error"}`,
      repoCount: expected.count,
      appliedCount: null,
    };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return compareLedger(response.status, payload, expected);
}

async function main(argv) {
  const base = argv[2];
  const result = await checkMigrationLedgerParity(base);
  const label = { 0: "PASS", 1: "FAIL (drift)", 2: "FAIL (could not check)" }[result.code];
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
  return result.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv);
}
