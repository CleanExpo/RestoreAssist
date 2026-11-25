/**
 * Fail a pull request that adds a migration folder production has not applied
 * yet (RA-8529).
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * On 21 Nov 2026 #2611 (RA-8495) merged and deployed to restoreassist.app
 * before its migration was applied. Merging to main deploys production, so
 * production ran code that read columns its database did not have. A note in
 * the PR body did not stop it, and Unite-Group had the same fault on 25 Oct.
 * migration-ledger-parity.yml only notices after the merge.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. The migration folders the PR adds: folders under prisma/migrations/ in
 *    the PR head that the CURRENT tip of the base branch does not have.
 * 2. None added: PASS, with no network call. Every other PR stays green.
 * 3. Some added: production's public /api/health/migrations must report a
 *    clean ledger whose fingerprint equals the fingerprint over the base
 *    branch's folders plus the added ones. That is the exact set production
 *    will need once this PR merges. The algorithm is ledgerFromNames, the same
 *    one the parity check and the route use.
 *
 * It turns green only once the migration has been applied to production
 * through the owner-approved path (.claude/RULES.md rule 29). It never applies
 * a migration, holds no credentials and sends no writes.
 *
 *   node scripts/ci/check-migration-merge-gate.mjs \
 *     --base origin/main --head <pr-head-sha> --origin https://restoreassist.app
 *
 * Exit 0 = the PR adds no migration, or production's ledger is exactly the
 *          base branch plus this PR's migrations.
 * Exit 1 = the PR adds a migration production has not applied (or production's
 *          ledger otherwise differs from base plus this PR).
 * Exit 2 = could not check: bad arguments, an unreadable git ref, an empty base
 *          migrations folder, a network error or a response that is not the
 *          health route. Never a pass.
 *
 * Output is counts, migration folder names and PASS/FAIL only. Fingerprints
 * are never printed.
 */

import { execFileSync } from "node:child_process";

import { EXIT, compareLedger, healthUrl } from "./check-migration-ledger-parity.mjs";
import { ledgerFromNames } from "./expected-migration-ledger.mjs";

export { EXIT };

const MIGRATIONS_PREFIX = "prisma/migrations/";

/**
 * Migration folder names at a git ref. Only tree entries count, which matches
 * expectedMigrationLedger (directories, not symlinks; git stores a symlink as
 * a blob) and skips migration_lock.toml.
 */
export function migrationNamesAtRef(ref, { root = process.cwd(), git = runGit } = {}) {
  if (typeof ref !== "string" || ref.trim() === "" || ref.startsWith("-")) {
    throw new Error(`invalid git ref ${JSON.stringify(ref)}`);
  }
  const out = git(["ls-tree", "-z", ref, "--", MIGRATIONS_PREFIX], root);
  const names = [];
  for (const entry of out.split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    const [, type] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    if (type !== "tree" || !path.startsWith(MIGRATIONS_PREFIX)) continue;
    names.push(path.slice(MIGRATIONS_PREFIX.length));
  }
  return names.sort();
}

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Folders in head that base does not have, sorted. */
export function addedMigrations(baseNames, headNames) {
  const base = new Set(baseNames);
  return [...new Set(headNames)].filter((name) => !base.has(name)).sort();
}

function unchecked(reason, added = []) {
  return { code: EXIT.UNCHECKED, verdict: "unchecked", reason, added };
}

/**
 * The gate. Returns { code, verdict, reason, added[, repoCount, appliedCount] }.
 * verdict is "no-migration", "pass", "drift" or "unchecked".
 */
export async function checkMigrationMergeGate(
  { base, head, origin },
  { root = process.cwd(), git = runGit, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {},
) {
  let baseNames;
  let headNames;
  let url;
  try {
    url = healthUrl(origin);
    baseNames = migrationNamesAtRef(base, { root, git });
    headNames = migrationNamesAtRef(head, { root, git });
  } catch (error) {
    return unchecked(firstLine(error));
  }
  if (baseNames.length === 0) {
    // A base branch with no migrations is a broken checkout or a wrong ref,
    // not a reason to wave every PR through.
    return unchecked(`base ${base} has no migration folders under ${MIGRATIONS_PREFIX}`);
  }

  const added = addedMigrations(baseNames, headNames);
  if (added.length === 0) {
    return {
      code: EXIT.PASS,
      verdict: "no-migration",
      reason: "this PR adds no migration folder",
      added,
    };
  }

  const expected = ledgerFromNames([...baseNames, ...added]);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "cache-control": "no-store" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unchecked(`request failed: ${error?.name ?? "Error"}`, added);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // Exact match only: no --allow-ahead for production.
  const result = compareLedger(response.status, payload, expected);
  const reason =
    result.code === EXIT.PASS
      ? "production has applied every migration this PR adds"
      : result.code === EXIT.DRIFT
        ? `production has not applied this PR's migration(s): ${result.reason}`
        : result.reason;
  return { ...result, reason, added };
}

function firstLine(error) {
  const text = String(error?.stderr || error?.message || error).trim();
  return text.split("\n")[0];
}

const VALUE_OPTIONS = new Set(["--base", "--head", "--origin", "--root"]);

/** Each of --base, --head and --origin exactly once; --root optional. */
export function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!VALUE_OPTIONS.has(arg)) return { error: `unknown argument ${arg}` };
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) return { error: `${arg} needs a value` };
    const key = arg.slice(2);
    if (key in values) return { error: `${arg} given twice` };
    values[key] = value;
    i += 1;
  }
  for (const key of ["base", "head", "origin"]) {
    if (!values[key]) return { error: `--${key} is required` };
  }
  return { values };
}

const USAGE =
  "usage: check-migration-merge-gate.mjs --base <ref> --head <ref> --origin <https-origin> [--root <dir>]";

export async function main(argv) {
  const parsed = parseArgs(argv.slice(2));
  const result = parsed.error
    ? unchecked(`${parsed.error}; ${USAGE}`)
    : await checkMigrationMergeGate(parsed.values, { root: parsed.values.root ?? process.cwd() });

  const label = { 0: "PASS", 1: "FAIL (not applied)", 2: "FAIL (could not check)" }[result.code];
  const counts =
    result.repoCount === undefined
      ? ""
      : ` (expected ${result.repoCount ?? "?"}, production ${result.appliedCount ?? "?"})`;
  const lines = [`[migration-merge-gate] ${label}: ${result.reason}${counts}`];
  for (const name of result.added) lines.push(`[migration-merge-gate]   adds ${name}`);
  if (result.code === EXIT.DRIFT) {
    lines.push(
      "[migration-merge-gate] Merging to main deploys production. Apply the migration(s) " +
        "through the owner-approved path first, then re-run this check.",
    );
  }
  const write = result.code === EXIT.PASS ? console.log : console.error;
  for (const line of lines) write(line);
  if (result.code !== EXIT.PASS && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::error title=Migration not applied on production::${result.reason}`);
  }
  return result.code;
}
