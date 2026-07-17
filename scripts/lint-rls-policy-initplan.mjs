/**
 * WS4 — RLS InitPlan forward-guard (RA-1807 remediation spec §9/§11, AC-16/AC-17).
 *
 * Rejects any NEW `CREATE POLICY` whose predicate calls a bare zero-arg
 * `auth.<uid|role|jwt|email>()` instead of the InitPlan-safe `(select auth.*())`
 * form. This is the forward recurrence fix for the RA-4827 → RA-4956 regression:
 * RA-4827 wrapped every predicate to drive `auth_rls_initplan` to 0, then RA-4956
 * (2026-06-14) reintroduced 27 unwrapped `auth.uid()` across 24 new policies. There
 * was no guard to stop the NEXT such regression — this is it.
 *
 * WHY BOTH ROOTS (adversarial-verify AV-1): RLS policies in this repo live in
 * BOTH `prisma/migrations/**` AND `docs/ops/supabase-migrations-archive/**` —
 * `CREATE POLICY` appears in prisma + archived supabase files, and some
 * workspace/evidence/media RLS files exist ONLY under `prisma/migrations/`.
 * A lint scoped to one root would miss a whole class of regression.
 * `scripts/audit-rls-coverage.ts` already walks both roots (its `MIGRATION_DIRS`);
 * this guard mirrors that.
 *
 * FORWARD-ONLY: migrations are immutable/append-only (see
 * `docs/migrations/DEDUPLICATION-PATTERN.md`), so a new policy always arrives in a
 * NEW file. In CI we therefore lint only the migration files ADDED (or modified)
 * in the PR — existing unwrapped debt (which WS6 will clear) is grandfathered, and
 * every new policy is held to the wrapped standard. Run with explicit file paths
 * (or fixture files) to lint an arbitrary set.
 *
 * Usage:
 *   node scripts/lint-rls-policy-initplan.mjs                 # CI: lint PR-added migrations
 *   node scripts/lint-rls-policy-initplan.mjs path/to/a.sql … # lint the given files
 *   LINT_BASE_REF=origin/sandbox node scripts/lint-rls-policy-initplan.mjs
 *
 * Exit codes:
 *   0  No new bare-auth policy predicates (or no migration files changed)
 *   1  A new/changed policy uses a bare auth.*() predicate (details on stderr)
 *   2  Could not determine the changed-file set (git failure) in CI mode
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The two migration roots RLS policies live in (AV-1). */
export const MIGRATION_ROOTS = [
  "prisma/migrations",
  "docs/ops/supabase-migrations-archive",
];

const AUTH_CALL = /auth\.(uid|role|jwt|email)\s*\(\s*\)/gi;
/** Preceding context that makes an auth call InitPlan-safe: `(select auth.…` */
const WRAPPED_BEFORE = /\(\s*select\s+$/i;

/**
 * Blank out SQL comments while preserving every other character position (so
 * line numbers and match indices stay exact) — critically, string and
 * dollar-quoted literals are copied VERBATIM. That distinction is the whole
 * point: a comment that merely mentions `auth.uid()` must not trip the guard
 * (RA-4827's wrapped exemplar documents its own rewrite in `--` comments), yet a
 * predicate built inside `format('… auth.uid() …')` MUST still be scanned,
 * because that emitter string is a real policy predicate.
 * @param {string} sql
 */
export function stripComments(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (c === "-" && c2 === "-") {
      while (i < n && sql[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && c2 === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      out += c;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          out += sql.slice(i);
          i = n;
        } else {
          out += sql.slice(i, end + tag.length);
          i = end + tag.length;
        }
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every bare (unwrapped) zero-arg auth call in `sql`. A call is "wrapped" (OK)
 * only when the text immediately before it is `(select ` — i.e. it is the first
 * token inside a scalar subselect `(select auth.uid())`. Anything else — a
 * direct `user_id = auth.uid()` predicate — is a bare offender that forces the
 * planner to evaluate the function per-row. Comments are ignored (see
 * stripComments); detection runs on the comment-stripped text but snippets are
 * quoted from the original so the reported line is human-readable.
 *
 * Pure + side-effect-free so it can be unit-tested against fixtures.
 * @param {string} sql
 * @returns {{ fn: string, line: number, snippet: string }[]}
 */
export function findUnwrappedAuthCalls(sql) {
  const scan = stripComments(sql);
  const offenders = [];
  for (const m of scan.matchAll(AUTH_CALL)) {
    const before = scan.slice(0, m.index);
    if (WRAPPED_BEFORE.test(before)) continue; // (select auth.…) — safe
    const line = before.split("\n").length;
    const lineStart = sql.lastIndexOf("\n", m.index - 1) + 1;
    let lineEnd = sql.indexOf("\n", m.index);
    if (lineEnd === -1) lineEnd = sql.length;
    const snippet = sql.slice(lineStart, lineEnd).trim();
    offenders.push({ fn: `auth.${m[1]}()`, line, snippet });
  }
  return offenders;
}

/**
 * True when `sql` defines or alters an RLS policy — the only context this guard
 * governs (a bare auth call elsewhere is out of scope for AC-16). Also matches
 * the repo's emitter helpers, which build policy predicates as text.
 * @param {string} sql
 */
export function definesPolicy(sql) {
  return (
    /\b(create|alter)\s+policy\b/i.test(sql) ||
    /pg_temp\.(policy_|rask_)/i.test(sql)
  );
}

/**
 * Lint a single file's SQL. Returns offenders only when the file defines a
 * policy; a non-RLS migration is never flagged.
 * @param {string} sql
 * @param {string} file
 * @returns {{ file: string, fn: string, line: number, snippet: string }[]}
 */
export function lintSql(sql, file) {
  if (!definesPolicy(sql)) return [];
  return findUnwrappedAuthCalls(sql).map((o) => ({ file, ...o }));
}

/** True for a repo-relative or absolute path under either migration root. */
export function isMigrationSql(file) {
  const norm = file.replace(/\\/g, "/");
  return (
    norm.endsWith(".sql") &&
    MIGRATION_ROOTS.some((root) => norm.includes(`${root}/`))
  );
}

/**
 * Migration `.sql` files added or modified in the PR, via git. Diffs the merge
 * base of `baseRef` so only this branch's changes are considered. Returns null
 * if git can't be queried (caller decides whether that's fatal).
 * @param {string} baseRef
 * @returns {string[] | null}
 */
export function changedMigrationFiles(baseRef) {
  const run = (args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  let range;
  try {
    // Prefer the merge base so we only see this branch's commits.
    const base = run(["merge-base", baseRef, "HEAD"]);
    range = `${base}..HEAD`;
  } catch {
    try {
      run(["rev-parse", "HEAD~1"]);
      range = "HEAD~1..HEAD";
    } catch {
      return null;
    }
  }
  let out;
  try {
    out = run(["diff", "--diff-filter=AMR", "--name-only", range]);
  } catch {
    return null;
  }
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isMigrationSql);
}

function main() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  let files;
  let ciMode = false;

  if (argv.length > 0) {
    files = argv;
  } else {
    ciMode = true;
    files = changedMigrationFiles(process.env.LINT_BASE_REF || "origin/main");
    if (files === null) {
      console.error(
        "[rls-initplan] ✗ could not determine changed files from git (need full history, e.g. actions/checkout fetch-depth: 0)",
      );
      process.exit(2);
    }
  }

  if (files.length === 0) {
    console.log(
      "[rls-initplan] ✓ no migration files to lint" +
        (ciMode ? " (none added/modified in this PR)" : ""),
    );
    process.exit(0);
  }

  const offenders = [];
  for (const file of files) {
    let sql;
    try {
      sql = fs.readFileSync(file, "utf8");
    } catch (err) {
      console.error(`[rls-initplan] ✗ cannot read ${file}: ${err.message}`);
      process.exit(2);
    }
    offenders.push(...lintSql(sql, path.normalize(file)));
  }

  if (offenders.length === 0) {
    console.log(
      `[rls-initplan] ✓ ${files.length} migration file(s) checked — every policy predicate wraps auth.*() in (select …)`,
    );
    process.exit(0);
  }

  console.error(
    `[rls-initplan] ✗ ${offenders.length} bare auth.*() predicate(s) in new/changed RLS policies:`,
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.fn}  →  ${o.snippet}`);
  }
  console.error("");
  console.error(
    "RLS predicates must wrap zero-arg auth calls in a scalar subselect so the",
  );
  console.error(
    "planner evaluates them once (InitPlan), not per row:  auth.uid()  →  (select auth.uid())",
  );
  console.error("This is the auth_rls_initplan recurrence guard (RA-4827 → RA-4956).");
  process.exit(1);
}

// Run only when invoked directly (not when imported by the test).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
