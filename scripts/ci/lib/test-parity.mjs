/**
 * RestoreAssist - CI test-parity guard (library).
 *
 * No top-level side effects. The CLI entry `scripts/ci/check-test-parity.mjs`
 * always calls `main()`. Tests import the functions below. Do not run `main()`
 * from this module's top level, and do not gate the CLI on `argv[1]` or
 * `import.meta.url`: a symlink whose name is not `check-test-parity.mjs`
 * would otherwise exit 0 without scanning.
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
 * WHAT IT SCANS
 * -------------
 * The file set is derived from `config/vitest.config.js` `test.include`, minus
 * `test.exclude` — the same set `vitest run --config config/vitest.config.js`
 * collects. There is no hand-kept root list. If that config cannot be loaded
 * or its globs cannot be expanded, the guard exits 1. It does not fall back
 * to a narrower scan.
 *
 * Modes:
 *   (default)   Report mode. Lists env-gated suites that will skip in the
 *               current environment. Exit 0 (informational).
 *   --strict    Verification mode. Exit 1 if ANY gating env var is missing,
 *               so it can guard a "claim green" step. Run it with the CI env
 *               (e.g. via `npm run test:db`) to make it pass.
 *   --changed   Only consider test files touched vs origin/main (git diff).
 *               Use in pre-push / PR verification to flag when YOUR change
 *               lands in a CI-only suite.
 *   --json      Emit machine-readable JSON instead of text.
 *
 * Usage:  node scripts/ci/check-test-parity.mjs [--strict] [--changed] [--json]
 *         npm run test:parity
 */
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const VITEST_CONFIG_RELATIVE = "config/vitest.config.js";

const TEST_RE = /\.test\.(ts|tsx|js|jsx|mts)$/;

const REFUSAL = "Refusing to fall back to a hand-kept scan list.";

function refusal(message) {
  return new Error(`test-parity: ${message} ${REFUSAL}`);
}

/**
 * Load `test.include` and `test.exclude` from the repo vitest config.
 * Throws if the file is missing, cannot be evaluated, or does not expose
 * those fields as string arrays. Never substitutes a default root list.
 */
export async function loadVitestTestConfig(root = process.cwd()) {
  const configPath = join(root, VITEST_CONFIG_RELATIVE);
  if (!existsSync(configPath)) {
    throw refusal(`vitest config not found at ${configPath}.`);
  }

  let mod;
  try {
    mod = await import(pathToFileURL(configPath).href);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw refusal(`failed to load ${configPath}: ${detail}.`);
  }

  let exported = mod?.default ?? mod;
  if (typeof exported === "function") {
    try {
      exported = await exported();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw refusal(`failed to evaluate ${configPath}: ${detail}.`);
    }
  }

  const include = exported?.test?.include;
  const exclude = exported?.test?.exclude;
  if (
    !Array.isArray(include) ||
    include.length === 0 ||
    include.some((pattern) => typeof pattern !== "string" || pattern.length === 0)
  ) {
    throw refusal(
      `${configPath} test.include must be a non-empty array of glob strings.`,
    );
  }
  if (
    !Array.isArray(exclude) ||
    exclude.some((pattern) => typeof pattern !== "string")
  ) {
    throw refusal(`${configPath} test.exclude must be an array of glob strings.`);
  }
  return { include, exclude, configPath };
}

function assertSupportedGlob(pattern) {
  if (pattern.startsWith("!")) {
    throw refusal(
      `glob "${pattern}" uses a negation. This guard does not expand negations.`,
    );
  }
  if (/[{}\[\]\\]/.test(pattern)) {
    throw refusal(
      `glob "${pattern}" uses braces, character classes, or backslashes. This guard does not expand that syntax.`,
    );
  }
  for (const part of pattern.split("/")) {
    if (part.includes("**") && part !== "**") {
      throw refusal(
        `glob "${pattern}" has "**" inside a path segment. This guard does not expand that syntax.`,
      );
    }
  }
}

/** Picomatch-style subset: `**` is a whole segment, `*` and `?` stay in-segment. */
export function globToRegExp(pattern) {
  assertSupportedGlob(pattern);
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          source += "(?:[^/]+/)*";
          i += 2;
          continue;
        }
        source += ".*";
        i += 1;
        continue;
      }
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if ("\\^$+?.()|".includes(char)) source += "\\";
    source += char;
  }
  source += "$";
  return new RegExp(source);
}

function staticPrefix(pattern) {
  const prefix = [];
  for (const part of pattern.split("/")) {
    if (part.includes("*") || part.includes("?")) break;
    prefix.push(part);
  }
  return prefix.join("/");
}

function toPosixRelative(root, abs) {
  return relative(root, abs).split(sep).join("/");
}

function collectMatching(root, pattern) {
  const re = globToRegExp(pattern);
  const prefix = staticPrefix(pattern);
  const start = prefix ? join(root, prefix) : root;
  if (!existsSync(start)) return [];

  const out = [];
  const seen = new Set();
  const walk = (abs) => {
    let real;
    try {
      real = realpathSync(abs);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);

    let st;
    try {
      st = statSync(real);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let entries;
      try {
        entries = readdirSync(real);
      } catch {
        return;
      }
      for (const entry of entries) walk(join(abs, entry));
      return;
    }
    if (!st.isFile()) return;
    const rel = toPosixRelative(root, abs);
    if (re.test(rel)) out.push(rel);
  };
  walk(start);
  return out;
}

/**
 * Files vitest would collect: every path matching `include`, minus any path
 * matching `exclude`. Paths are repo-relative and sorted.
 */
export function filesMatchingVitestGlobs(root, include, exclude) {
  const excludeRes = exclude.map((pattern) => globToRegExp(pattern));
  const files = new Set();
  for (const pattern of include) {
    for (const rel of collectMatching(root, pattern)) {
      if (excludeRes.some((re) => re.test(rel))) continue;
      files.add(rel);
    }
  }
  return [...files].sort();
}

/** Scan set for this repo: vitest include minus vitest exclude. */
export async function listParityScanFiles(root = process.cwd()) {
  const { include, exclude } = await loadVitestTestConfig(root);
  return filesMatchingVitestGlobs(root, include, exclude);
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
export function gatingEnvVars(src) {
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

export async function main(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const strict = args.has("--strict");
  const changedOnly = args.has("--changed");
  const asJson = args.has("--json");
  const root = process.cwd();
  let scanned;
  try {
    scanned = await listParityScanFiles(root);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const changed = changedOnly ? changedTestFiles() : null;
  const considered = changed
    ? scanned.filter((rel) => changed.has(rel))
    : scanned;

  const findings = [];
  for (const rel of considered) {
    const src = readFileSync(join(root, rel), "utf8");
    if (!/\.(?:skipIf|runIf)\(/.test(src)) continue;
    const vars = [...gatingEnvVars(src)];
    if (vars.length) findings.push({ file: rel, vars });
  }

  // Aggregate which gating env vars are present vs missing in THIS environment.
  const allVars = new Set();
  for (const f of findings) f.vars.forEach((v) => allVars.add(v));
  const missing = [...allVars].filter((v) => !process.env[v]).sort();
  const present = [...allVars].filter((v) => process.env[v]).sort();

  const skippedHere = findings.filter((f) =>
    f.vars.some((v) => missing.includes(v)),
  );

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          scannedCount: considered.length,
          findings,
          present,
          missing,
          skippedHere,
          strict,
        },
        null,
        2,
      ),
    );
  } else {
    const scope = changedOnly
      ? "changed test files within vitest include"
      : "vitest include";
    console.log(
      `\nCI test-parity guard — scope: ${scope} (${considered.length} file(s))\n`,
    );
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
            "  Run them the CI way before claiming green:  npm run test:db\n",
        );
      } else {
        console.log("\n  All gating env vars are present. Local run is CI-representative.\n");
      }
    }
  }

  if (strict && missing.length) {
    console.error(
      `test-parity: ${missing.length} gating env var(s) missing (${missing.join(", ")}). ` +
        `Refusing to treat this run as authoritative. Use 'npm run test:db'.`,
    );
    process.exit(1);
  }
}
