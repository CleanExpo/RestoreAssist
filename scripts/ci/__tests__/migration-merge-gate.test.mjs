// RA-8529: a PR that adds a migration folder must stay red until production's
// ledger has it. These tests build a real git repository per case (base and
// head commits) and stand in for production with a stub fetch, or with a local
// HTTP server for the CLI. Nothing here reaches the network or a database.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ledgerFromNames } from "../lib/expected-migration-ledger.mjs";
import {
  EXIT,
  addedMigrations,
  checkMigrationMergeGate,
  migrationNamesAtRef,
  parseArgs,
} from "../lib/migration-merge-gate.mjs";

const SCRIPT = fileURLToPath(new URL("../check-migration-merge-gate.mjs", import.meta.url));
const ORIGIN = "https://restoreassist.app";
const BASE = ["20260101000000_first", "20260202000000_second"];
const PLANTED = "20261121000000_ra8495_office_intake";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};
const git = (root, ...args) => execFileSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" }).trim();

function addMigration(root, name) {
  mkdirSync(join(root, "prisma", "migrations", name), { recursive: true });
  writeFileSync(join(root, "prisma", "migrations", name, "migration.sql"), "SELECT 1;\n");
}

/** A repo whose `base` commit has baseNames and whose `head` commit adds headExtra. */
function repo({ baseNames = BASE, headExtra = [], headFiles = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ra8529-gate-"));
  git(root, "init", "-q", "-b", "main");
  mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  writeFileSync(join(root, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
  writeFileSync(join(root, "README"), "x\n");
  for (const name of baseNames) addMigration(root, name);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "tag", "base");
  for (const name of headExtra) addMigration(root, name);
  for (const [rel, text] of Object.entries(headFiles)) writeFileSync(join(root, rel), text);
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "head");
  git(root, "tag", "head");
  return root;
}

function healthy(names) {
  const { count, fingerprint } = ledgerFromNames(names);
  return {
    status: "ok",
    counts: { applied: count, failed: 0, rolled_back: 0, total: count },
    databaseFingerprint: "d".repeat(64),
    migrationLedgerFingerprint: fingerprint,
  };
}

function stubFetch(status, body, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    return {
      status,
      async json() {
        if (typeof body === "string") throw new SyntaxError("Unexpected token");
        return body;
      },
    };
  };
}

const refs = { base: "base", head: "head", origin: ORIGIN };

test("a planted migration production has not applied fails (the #2611 fault)", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const seen = [];
  const result = await checkMigrationMergeGate(refs, { root, fetchImpl: stubFetch(200, healthy(BASE), seen) });
  assert.equal(result.code, EXIT.DRIFT);
  assert.deepEqual(result.added, [PLANTED]);
  assert.match(result.reason, /production has not applied this PR's migration/);
  assert.match(result.reason, /applied 2 migrations, repo has 3/);
  assert.equal(seen[0].url, `${ORIGIN}/api/health/migrations`);
  assert.equal(seen[0].init.redirect, "error");
});

test("the same PR passes once production has applied its migration", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const result = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: stubFetch(200, healthy([...BASE, PLANTED])),
  });
  assert.equal(result.code, EXIT.PASS);
  assert.equal(result.verdict, "pass");
});

test("a clean diff (no migration added) passes without any network call", async () => {
  const root = repo({ headFiles: { "README": "changed\n" } });
  let called = false;
  const result = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: async () => {
      called = true;
      throw new Error("must not fetch");
    },
  });
  assert.equal(result.code, EXIT.PASS);
  assert.equal(result.verdict, "no-migration");
  assert.equal(called, false);
});

test("same count but a different applied name fails (production has some other migration)", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const result = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: stubFetch(200, healthy([...BASE, "20261122000000_someone_elses"])),
  });
  assert.equal(result.code, EXIT.DRIFT);
  assert.match(result.reason, /names differ/);
});

test("production ahead of base plus this PR fails: exact match only", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const result = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: stubFetch(200, healthy([...BASE, PLANTED, "20261123000000_extra"])),
  });
  assert.equal(result.code, EXIT.DRIFT);
});

test("a head that is behind base still counts base's migrations (PR not rebased)", async () => {
  // Base gained a migration after the PR branched; the PR adds its own.
  const root = repo({ baseNames: [...BASE, "20261120000000_on_main"], headExtra: [] });
  git(root, "checkout", "-q", "-b", "pr", "base~0");
  // A PR head that lacks base's newer migration but adds PLANTED.
  git(root, "rm", "-q", "-r", "prisma/migrations/20261120000000_on_main");
  addMigration(root, PLANTED);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "pr head");
  git(root, "tag", "-f", "head");
  const expectedNames = [...BASE, "20261120000000_on_main", PLANTED];
  const pass = await checkMigrationMergeGate(refs, { root, fetchImpl: stubFetch(200, healthy(expectedNames)) });
  assert.equal(pass.code, EXIT.PASS);
  assert.deepEqual(pass.added, [PLANTED]);
  const fail = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: stubFetch(200, healthy([...BASE, PLANTED])),
  });
  assert.equal(fail.code, EXIT.DRIFT);
});

test("could-not-check is never a pass: network error, non-JSON, rate limit, drift status", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const network = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.equal(network.code, EXIT.UNCHECKED);
  const html = await checkMigrationMergeGate(refs, { root, fetchImpl: stubFetch(502, "<html>") });
  assert.equal(html.code, EXIT.UNCHECKED);
  const limited = await checkMigrationMergeGate(refs, { root, fetchImpl: stubFetch(429, { error: "slow down" }) });
  assert.equal(limited.code, EXIT.UNCHECKED);
  const drift = await checkMigrationMergeGate(refs, {
    root,
    fetchImpl: stubFetch(503, { status: "drift", error: "Could not read the migration ledger" }),
  });
  assert.equal(drift.code, EXIT.DRIFT);
});

test("an unknown ref, an empty base and a bad origin fail closed before any request", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const noFetch = async () => {
    throw new Error("must not fetch");
  };
  const badRef = await checkMigrationMergeGate({ ...refs, head: "no-such-ref" }, { root, fetchImpl: noFetch });
  assert.equal(badRef.code, EXIT.UNCHECKED);
  const optionRef = await checkMigrationMergeGate({ ...refs, base: "--output=x" }, { root, fetchImpl: noFetch });
  assert.equal(optionRef.code, EXIT.UNCHECKED);
  assert.match(optionRef.reason, /invalid git ref/);
  const badOrigin = await checkMigrationMergeGate({ ...refs, origin: "ftp://x" }, { root, fetchImpl: noFetch });
  assert.equal(badOrigin.code, EXIT.UNCHECKED);
  const empty = repo({ baseNames: [], headExtra: [PLANTED] });
  const emptyBase = await checkMigrationMergeGate(refs, { root: empty, fetchImpl: noFetch });
  assert.equal(emptyBase.code, EXIT.UNCHECKED);
  assert.match(emptyBase.reason, /has no migration folders/);
});

test("only folders count: migration_lock.toml and a symlink are not migrations", () => {
  const root = repo({ headExtra: [PLANTED] });
  symlinkSync(PLANTED, join(root, "prisma", "migrations", "20991231000000_link"));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "symlink");
  git(root, "tag", "-f", "head");
  assert.deepEqual(migrationNamesAtRef("base", { root }), BASE);
  assert.deepEqual(migrationNamesAtRef("head", { root }), [...BASE, PLANTED].sort());
  assert.deepEqual(addedMigrations(["a", "b"], ["b", "c", "a", "c"]), ["c"]);
});

test("parseArgs refuses missing, repeated and unknown arguments", () => {
  assert.match(parseArgs([]).error, /--base is required/);
  assert.match(parseArgs(["--base", "a", "--head", "b"]).error, /--origin is required/);
  assert.match(parseArgs(["--base", "a", "--base", "b"]).error, /given twice/);
  assert.match(parseArgs(["--base"]).error, /needs a value/);
  assert.match(parseArgs(["--allow-ahead"]).error, /unknown argument/);
  assert.deepEqual(parseArgs(["--base", "a", "--head", "b", "--origin", ORIGIN]).values, {
    base: "a",
    head: "b",
    origin: ORIGIN,
  });
});

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function withServer(payload, fn) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("CLI: red while production lacks the planted migration, green once it has it", async () => {
  const root = repo({ headExtra: [PLANTED] });
  const args = (origin) => ["--base", "base", "--head", "head", "--origin", origin, "--root", root];
  const red = await withServer(healthy(BASE), (origin) => runCli(args(origin)));
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /FAIL \(not applied\)/);
  assert.match(red.out, new RegExp(`adds ${PLANTED}`));
  assert.doesNotMatch(red.out, /[0-9a-f]{64}/, "fingerprints are never printed");
  const green = await withServer(healthy([...BASE, PLANTED]), (origin) => runCli(args(origin)));
  assert.equal(green.code, 0, green.out);
  assert.match(green.out, /PASS: production has applied every migration this PR adds/);
});

test("CLI: no arguments is could-not-check (2), not a pass", async () => {
  const { code, out } = await runCli([]);
  assert.equal(code, 2);
  assert.match(out, /FAIL \(could not check\).*--base is required/);
});
