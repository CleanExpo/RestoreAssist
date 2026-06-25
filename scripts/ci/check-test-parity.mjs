#!/usr/bin/env node
/**
 * RestoreAssist - CI test-parity guard.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Many suites are gated with `describe.skipIf(!process.env.DATABASE_URL)` (and
 * similar). On a developer laptop with no DATABASE_URL these suites SILENTLY
 * SKIP, so `vitest run` prints all-green. In CI a Postgres service sets
 * DATABASE_URL, so the very same suites RUN - and can fail. That gap is the
 * single most common cause of "green locally, red in CI" on this repo.
 *
 * This guard makes the gap LOUD instead of silent. It scans the test tree for
 * env-gated suites, works out which env vars gate them, and reports any gating
 * var that is missing from the current environment - i.e. every suite that a
 * local run will NOT actually execute.
 *
 * Modes:
 *   (default)   Report mode. Lists env-gated suites that will skip in the
 *               current environment. Exit 0 (informational).
 *   --strict    Verification mode. Exit 1 if ANY gating env var is missing,
 *               so it can guard a "claim green" step. Run it with the CI env
 *               (e.g. via `pnpm test:db`) to make it pass.
 *   --changed   Only consider test files touched vs origin/main (git diff).
 *               Use in pre-push / PR verification to flag when YOUR change
 *               lands in a CI-only suite.
 *   --json      Emit machine-readable JSON instead of text.
 *
 * Usage:  node scripts/ci/check-test-parity.mjs [--strict] [--changed] [--json]
 *         pnpm test:parity
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "src", "components", "lib", "server"];
const TEST_RE = /\.test\.(ts|tsx|js|jsx|mts)$/;
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const CHANGED_ONLY = ARGS.has("--changed");
const AS_JSON = ARGS.has("--json");

/** Recursively collect every test file under the scan dirs. */
function collectTestFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) collectTestFiles(full, acc);
    else if (TEST_RE.test(entry)) acc.push(full);
  }
  return acc;
}

/** Files changed vs origin/main (best-effort; empty set => "consider all"). */
function changedTestFiles() {
  try {
    const base = execSync("git merge-base origin/main HEAD", {
      encoding: "utf8",
    }).trim();
    const out = execSync(`git diff --name-only ${base} HEAD`, {
      encoding: "utf8",
    });
    return new Set(
      out
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => TEST_RE.test(s)),
    );
  } catch {
    return new Set();
  }
}

/**
 * Extract the env vars that gate suites in a file.
 * Handles two shapes:
 *   1. Direct:   describe.skipIf(!process.env.DATABASE_URL)(...)
 *                it.skipIf(!process.env.X) / .runIf(process.env.X)
 *   2. Aliased:  const HAS_DB = !!process.env.DATABASE_URL
 *                describe.skipIf(!HAS_DB)(...)
 */
function gatingEnvVars(src) {
  const vars = new Set();

  // Map local boolean aliases -> env var, e.g. `const HAS_DB = process.env.DATABASE_URL`
  const aliasToEnv = new Map();
  const aliasRe =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:!!|Boolean\(|\()?\s*process\.env\.([A-Z0-9_]+)/g;
  for (const m of src.matchAll(aliasRe)) aliasToEnv.set(m[1], m[2]);

  // Find every skipIf/runIf condition and resolve it to env var(s).
  const gateRe = /\.(?:skipIf|runIf)\(\s*([^)]*?)\)/g;
  for (const m of src.matchAll(gateRe)) {
    const cond = m[1];
    for (const e of cond.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      vars.add(e[1]);
    }
    for (const a of cond.matchAll(/[!\s]*([A-Za-z_$][\w$]*)/g)) {
      if (aliasToEnv.has(a[1])) vars.add(aliasToEnv.get(a[1]));
    }
  }
  return vars;
}

const changed = CHANGED_ONLY ? changedTestFiles() : null;

const findings = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of collectTestFiles(abs)) {
    const rel = relative(ROOT, file);
    if (changed && !changed.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    if (!/\.(?:skipIf|runIf)\(/.test(src)) continue;
    const vars = [...gatingEnvVars(src)];
    if (vars.length) findings.push({ file: rel, vars });
  }
}

// Aggregate which gating env vars are present vs missing in THIS environment.
const allVars = new Set();
for (const f of findings) f.vars.forEach((v) => allVars.add(v));
const missing = [...allVars].filter((v) => !process.env[v]).sort();
const present = [...allVars].filter((v) => process.env[v]).sort();

const skippedHere = findings.filter((f) =>
  f.vars.some((v) => missing.includes(v)),
);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { findings, present, missing, skippedHere, strict: STRICT },
      null,
      2,
    ),
  );
} else {
  const scope = CHANGED_ONLY ? "changed test files" : "all test files";
  console.log(`\nCI test-parity guard — scope: ${scope}\n`);
  if (findings.length === 0) {
    console.log("  No env-gated suites found. Local run is CI-representative.\n");
  } else {
    console.log(
      `  Env-gated suites: ${findings.length} file(s) gate on: ${[...allVars].sort().join(", ")}`,
    );
    if (present.length) console.log(`  Present here:  ${present.join(", ")}`);
    if (missing.length) {
      console.log(`  MISSING here:  ${missing.join(", ")}`);
      console.log(
        `\n  ${skippedHere.length} file(s) will SILENTLY SKIP locally but RUN in CI:\n`,
      );
      for (const f of skippedHere) {
        console.log(`    - ${f.file}  [${f.vars.join(", ")}]`);
      }
      console.log(
        "\n  A local 'green' here does NOT prove these suites pass.\n" +
          "  Run them the CI way before claiming green:  pnpm test:db\n",
      );
    } else {
      console.log("\n  All gating env vars are present. Local run is CI-representative.\n");
    }
  }
}

if (STRICT && missing.length) {
  console.error(
    `test-parity: ${missing.length} gating env var(s) missing (${missing.join(", ")}). ` +
      `Refusing to treat this run as authoritative. Use 'pnpm test:db'.`,
  );
  process.exit(1);
}
