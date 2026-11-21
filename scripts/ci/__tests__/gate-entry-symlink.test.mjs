/**
 * Every CI gate must actually run when it is started through a symlink (RA-7785).
 *
 * THE FAULT
 * ---------
 * A gate that only ran main() when its module URL matched the process's script
 * argument skipped main() whenever the two were spelled differently. Node
 * resolves a symlink in the module URL but leaves the argument as the link
 * path, so through a symlink (or with a lowercase drive letter, or a space in
 * the path) the gate printed nothing and exited 0. CI read that as a pass.
 * 55 scripts under scripts/ were built that way.
 *
 * WHAT THIS PROVES
 * ----------------
 * 1. Discovery: the gate list is read from what `.github/workflows/*` and the
 *    gate-shaped `package.json` scripts actually invoke (scripts/ci/lib/
 *    invoked-gates.mjs). Every invoked script that is a thin entry over a lib/
 *    module must have a bad-input recipe below, or a reviewed exemption. A new
 *    gate without one fails here, by name. A recipe for a gate nobody invokes
 *    any more fails too, so the table cannot rot.
 * 2. For each recipe, the gate is spawned through a symlink, with a minimal
 *    environment, from an empty scratch directory, and must exit with the
 *    stated non-zero code AND print the stated reason. The reason match is what
 *    separates "main ran and refused" from "the module failed to load", which
 *    also exits non-zero. Where a gate uses different codes for a usage error
 *    and a real finding, both are pinned.
 * 3. No invoked script still carries an argv-based main-module check.
 *
 * None of this touches the network or a database: every recipe fails before
 * the first outbound call.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { invokedScripts, isLibEntry } from "../lib/invoked-gates.mjs";
import { scanText } from "../lib/no-argv-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

const write = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};
const copy = (dir, rel) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
};

/**
 * Bad input per gate. `cwd` is an empty scratch directory the recipe may fill.
 * `code` is the exact exit status; `match` must appear in stdout+stderr.
 */
const RECIPES = {
  "scripts/audit-ai-call-sites.ts": [
    {
      name: "an AI surface with no inferable task class fails --gate",
      args: ["--gate"],
      setup: (cwd) =>
        write(cwd, "lib/zzqq.ts", 'import Anthropic from "@anthropic-ai/sdk";\nconst c = new Anthropic();\nawait c.messages.create({});\n'),
      code: 1,
      match: /AI guardrail audit failed: 1 unknown task class/,
    },
  ],
  "scripts/audit-api-routes.ts": [
    {
      name: "a route with no auth gate is an error",
      setup: (cwd) =>
        write(cwd, "app/api/probe/route.ts", "export async function GET() { return Response.json({ ok: true }); }\n"),
      code: 1,
      match: /\[error\] app\/api\/probe\/route\.ts :: api-auth-required/,
    },
  ],
  "scripts/audit-prod-cves.ts": [
    {
      name: "a lockfile with no packages map fails before any advisory request",
      setup: (cwd) => {
        write(cwd, "package.json", "{}\n");
        write(cwd, "package-lock.json", "{}\n");
      },
      code: 1,
      match: /\[audit:prod\] failed: .*package-lock\.json has no packages map/,
    },
  ],
  "scripts/check-design-tokens.mjs": [
    {
      name: "a DESIGN.md with no token rows fails rather than passing on an empty set",
      setup: (cwd) => {
        write(cwd, "app/globals.css", ":root { --color-brand-navy: #1C2E47; }\n");
        write(cwd, ".claude/DESIGN.md", "nothing here\n");
      },
      code: 1,
      match: /FAIL: DESIGN\.md declares no/,
    },
  ],
  "scripts/check-encoding.mjs": [
    {
      name: "a byte-order mark in CLAUDE.md fails",
      setup: (cwd) => writeFileSync(path.join(cwd, "CLAUDE.md"), Buffer.from("﻿# x\n", "utf8")),
      code: 1,
      match: /CLAUDE\.md\s+leading UTF-8 byte-order mark/,
    },
  ],
  "scripts/check-pr-scope.mjs": [
    {
      name: "usage: a missing PR_CHANGED_FILES is refused",
      code: 1,
      match: /PR_CHANGED_FILES must be a non-negative integer/,
    },
    {
      name: "hit: a PR above the review ceiling fails",
      env: { PR_CHANGED_FILES: "101" },
      code: 1,
      match: /PR changes 101 files, above the 100-file review ceiling/,
    },
  ],
  "scripts/check-schema-drift.mjs": [
    {
      name: "usage: no schema to compare is exit 2, never a pass",
      code: 2,
      match: /schema file not found at prisma\/schema\.prisma/,
    },
  ],
  "scripts/ci/assert-production-smoke-origin.mjs": [
    { name: "usage: no base URL", code: 1, match: /usage: assert-production-smoke-origin\.mjs/ },
    {
      name: "hit: a non-production origin is refused",
      args: ["https://evil.example"],
      code: 1,
      match: /production smoke target must be exactly/,
    },
  ],
  "scripts/ci/check-migration-ledger-parity.mjs": [
    {
      name: "usage: no target origin is could-not-check (2), not a pass",
      code: 2,
      match: /FAIL \(could not check\).*a target origin is required/,
    },
  ],
  "scripts/ci/check-migration-preresolve.mjs": [
    {
      name: "a tree with nothing to read fails",
      code: 1,
      match: /::error::ENOENT/,
    },
  ],
  "scripts/ci/check-no-argv-guard.mjs": [
    { name: "usage: --root with no value is exit 2", args: ["--root"], code: 2, match: /usage: check-no-argv-guard\.mjs/ },
    {
      name: "hit: a planted argv guard is exit 1 with file and line",
      args: ["--root", "."],
      // Assembled from pieces so this file is not itself a finding.
      setup: (cwd) => write(cwd, "scripts/x.mjs", "if (import.meta.url === `file://${process.argv" + "[1]}`) main();\n"),
      code: 1,
      match: /scripts\/x\.mjs:1 /,
    },
  ],
  "scripts/ci/check-process-env-baseline.mjs": [
    {
      // Baselined paths resolve against the working directory, so an empty
      // tree makes every committed entry stale: main ran and refused.
      name: "a tree with none of the baselined files fails on stale entries",
      code: 1,
      match: /check:process-env-baseline FAILED[\s\S]*: baselined but the file no longer exists; remove it/,
    },
  ],
  "scripts/ci/check-release-bootstrap.mjs": [
    {
      name: "a root with no package.json fails",
      code: 1,
      match: /check:release-bootstrap - FAIL[\s\S]*package\.json cannot be read/,
    },
  ],
  "scripts/ci/expected-migration-ledger.mjs": [
    {
      name: "no migrations directory fails",
      code: 1,
      match: /\[migration-ledger\] FAIL: .*prisma\/migrations/,
    },
  ],
  "scripts/ci/migration-ledger-issue.mjs": [
    {
      name: "an unknown ledger target is refused before any GitHub call",
      code: 1,
      match: /LEDGER_TARGET must be one of/,
    },
  ],
  "scripts/ci/producers/a1-core-journeys.ts": [
    { name: "usage: no --report is exit 2", code: 2, match: /--report=<playwright\.json> is required/ },
    {
      name: "hit: a report with no suites fails",
      args: ["--report=r.json"],
      setup: (cwd) => write(cwd, "r.json", "{}\n"),
      code: 1,
      match: /Playwright report carries no suites array/,
    },
  ],
  "scripts/ci/render-production-app-spec.mjs": [
    { name: "usage: wrong argument count is exit 2", code: 2, match: /usage: render-production-app-spec\.mjs/ },
    {
      name: "hit: a sentinel digest is refused",
      args: ["not-a-digest", "out.json", "receipt.json"],
      setup: (cwd) => copy(cwd, ".do/app.yaml"),
      code: 1,
      match: /image digest must be a non-sentinel lowercase sha256 digest/,
    },
  ],
  "scripts/ci/supabase-advisor-gate.ts": [
    {
      name: "no access token fails closed before any API call",
      code: 1,
      match: /SUPABASE_ACCESS_TOKEN is not set/,
    },
  ],
  "scripts/ci/trigger-production-crons.mjs": [
    { name: "usage: no CRON_SECRET", code: 1, match: /CRON_SECRET missing/ },
    {
      name: "hit: a schedule the manifest does not know is refused before any request",
      env: { CRON_SECRET: "x", CRON_EVENT_SCHEDULE: "bogus" },
      code: 1,
      match: /\[cron\] unknown schedule "bogus"/,
    },
  ],
  "scripts/ci/verify-production-environment.mjs": [
    { name: "usage: no environment file", code: 1, match: /usage: verify-production-environment\.mjs/ },
    {
      name: "hit: an environment that is not production is refused",
      args: ["env.json"],
      setup: (cwd) => write(cwd, "env.json", "{}\n"),
      code: 1,
      match: /deployment environment must be named production/,
    },
  ],
  "scripts/ci/verify-release-gate-run.mjs": [
    { name: "usage: wrong argument count", code: 1, match: /usage: verify-release-gate-run\.mjs/ },
  ],
  "scripts/ci/verify-release-provenance.mjs": [
    {
      name: "no repository to fetch from fails",
      // GIT_DIR pins git to a path that does not exist, so it can never reach a remote.
      env: { GIT_DIR: "no-such-git-dir" },
      code: 1,
      match: /\[release-provenance\] FAIL: Command failed: git fetch/,
    },
  ],
  "scripts/lint-rls-policy-initplan.mjs": [
    { name: "usage: an unreadable file is exit 2", args: ["nope.sql"], code: 2, match: /cannot read nope\.sql/ },
    {
      name: "hit: a bare auth.uid() predicate is exit 1",
      args: ["20990101000000_x.sql"],
      setup: (cwd) => write(cwd, "20990101000000_x.sql", "CREATE POLICY p ON t USING (user_id = auth.uid());\n"),
      code: 1,
      match: /1 bare auth\.\*\(\) predicate/,
    },
  ],
  "scripts/release-gate-score.ts": [
    {
      name: "an unknown release profile is refused before any criterion runs",
      args: ["--profile=bogus"],
      setup: (cwd) => copy(cwd, "docs/RELEASE_GATE.md"),
      code: 1,
      match: /Invalid release profile "bogus"/,
    },
  ],
  "scripts/verify-database-identity.mjs": [
    { name: "no DIRECT_URL is refused before any connection", code: 1, match: /DIRECT_URL is required/ },
  ],
};

/**
 * EXIT-CODE EXEMPTIONS. Reviewed, kept small. Each of these reads a root fixed
 * by its own file location, so no scratch directory or argument can hand it
 * bad input without changing what it checks. They are still started through
 * the symlink, and must print their own banner: the old guard printed nothing,
 * so a regression is still caught. Their exit code is whatever the real tree
 * earns, which this test does not pin.
 */
const EXEMPT = {
  // Root is two levels above its own file; audits the real migrations archive.
  "scripts/audit-rls.ts": { why: "fixed repo root", match: /RLS audit (passed|FAILED)/ },
  // Root is three levels above its own file; scans the real app/ and lib/.
  "scripts/check-api-error-sinks.mjs": { why: "fixed repo root", match: /API error sink guard (passed|FAILED)/ },
  // Root is three levels above its own file; discovers the real e2e/ specs.
  "scripts/ci/check-e2e-coverage.mjs": {
    why: "fixed repo root",
    args: ["--summary"],
    match: /check-e2e-coverage: \d+ e2e spec\(s\)/,
  },
  // Reads the real mjs-test manifest; --list prints the plan and runs nothing,
  // so this test cannot recurse into itself.
  "scripts/ci/run-mjs-tests.mjs": { why: "fixed repo root", args: ["--list"], match: /run-mjs-tests: \d+ suite\(s\) on disk/ },
  // Scans the real app/api against the baselines that sit beside its entry.
  "scripts/security/route-safety-scan.mjs": { why: "fixed repo root", match: /# Route-safety scan|\[route-safety\]/ },
};

/** The gates CI starts that are thin entries over a lib/ module. */
function discoverGates() {
  const gates = new Map();
  for (const [file, callers] of invokedScripts(ROOT)) {
    if (isLibEntry(readFileSync(path.join(ROOT, file), "utf8"))) gates.set(file, callers);
  }
  return gates;
}

function spawnThroughSymlink(gate, { args = [], env = {}, setup } = {}) {
  const scratch = mkdtempSync(path.join(tmpdir(), "ra7785-gate-"));
  try {
    const linkDir = path.join(scratch, "link");
    const cwd = path.join(scratch, "cwd");
    mkdirSync(linkDir);
    mkdirSync(cwd);
    const link = path.join(linkDir, path.basename(gate));
    symlinkSync(path.join(ROOT, gate), link);
    // Positive control: the start path really differs from the resolved one.
    assert.notEqual(link, realpathSync(link));
    setup?.(cwd);
    const [cmd, argv] = gate.endsWith(".ts") ? [TSX, [link, ...args]] : [process.execPath, [link, ...args]];
    const run = spawnSync(cmd, argv, {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME ?? scratch, ...env },
      encoding: "utf8",
      timeout: 90_000,
    });
    return { status: run.status, signal: run.signal, error: run.error, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const GATES = discoverGates();

test("discovery reads the gates from the workflows and package.json, and finds them", () => {
  // "Found nothing" from a broken parser looks exactly like "nothing to check".
  assert.ok(GATES.size >= 20, `only ${GATES.size} gate entries discovered`);
  assert.ok(GATES.has("scripts/ci/check-release-bootstrap.mjs"), "a known gate was not discovered");
});

test("every gate CI invokes has a bad-input recipe or a reviewed exemption", () => {
  const missing = [...GATES.keys()].filter((g) => !RECIPES[g] && !EXEMPT[g]);
  assert.deepEqual(
    missing,
    [],
    `invoked gate(s) with no symlink recipe: ${missing.map((g) => `${g} (${GATES.get(g).join(", ")})`).join("; ")}. ` +
      "Add bad input to RECIPES in this file, or a reviewed EXEMPT entry with the reason.",
  );
  const both = Object.keys(EXEMPT).filter((g) => RECIPES[g]);
  assert.deepEqual(both, [], "a gate is both exempt and has a recipe");
});

test("no recipe or exemption names a gate that CI no longer invokes", () => {
  const stale = [...Object.keys(RECIPES), ...Object.keys(EXEMPT)].filter((g) => !GATES.has(g));
  assert.deepEqual(stale, [], `stale entries: ${stale.join(", ")}`);
});

test("no script CI invokes decides whether to run from its process argument", () => {
  const found = [];
  for (const file of invokedScripts(ROOT).keys()) {
    for (const hit of scanText(readFileSync(path.join(ROOT, file), "utf8"))) found.push(`${file}:${hit.line}`);
  }
  assert.deepEqual(found, []);
});

for (const [gate, recipes] of Object.entries(RECIPES)) {
  for (const recipe of recipes) {
    test(`${gate} through a symlink: ${recipe.name}`, () => {
      const run = spawnThroughSymlink(gate, recipe);
      assert.equal(run.error, undefined, String(run.error));
      assert.equal(run.signal, null, `killed by ${run.signal}`);
      assert.equal(run.status, recipe.code, `exit ${run.status}, expected ${recipe.code}. Output:\n${run.out}`);
      assert.match(run.out, recipe.match, `the gate exited ${run.status} without the expected reason. Output:\n${run.out}`);
    });
  }
}

for (const [gate, exempt] of Object.entries(EXEMPT)) {
  test(`${gate} through a symlink still runs (exit code exempt: ${exempt.why})`, () => {
    const run = spawnThroughSymlink(gate, exempt);
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.signal, null, `killed by ${run.signal}`);
    assert.equal(typeof run.status, "number");
    assert.match(run.out, exempt.match, `no banner: main() did not run. Output:\n${run.out}`);
  });
}
