import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXIT,
  checkMigrationLedgerParity,
  compareLedger,
  healthUrl,
} from "../lib/check-migration-ledger-parity.mjs";
import { expectedMigrationLedger } from "../lib/expected-migration-ledger.mjs";

const SCRIPT = fileURLToPath(new URL("../check-migration-ledger-parity.mjs", import.meta.url));

function repoWith(names) {
  const root = mkdtempSync(join(tmpdir(), "restoreassist-parity-"));
  mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  for (const name of names) mkdirSync(join(root, "prisma", "migrations", name));
  return root;
}

const NAMES = ["20260101_first", "20260202_second", "20260825134000_pending_invite_identity"];

function healthyPayload(names) {
  const { count, fingerprint } = expectedMigrationLedger(repoWith(names));
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

test("passes when the deployed ledger matches the repo exactly", async () => {
  const seen = [];
  const result = await checkMigrationLedgerParity("https://restoreassist.app/", {
    fetchImpl: stubFetch(200, healthyPayload(NAMES), seen),
    root: repoWith(NAMES),
  });
  assert.equal(result.code, EXIT.PASS);
  assert.equal(result.repoCount, 3);
  assert.equal(result.appliedCount, 3);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://restoreassist.app/api/health/migrations");
  assert.equal(seen[0].init.redirect, "error");
});

test("fails as drift when the database is one migration behind (the RA-7938 sandbox fault)", async () => {
  const deployed = healthyPayload(NAMES.slice(0, 2));
  const result = await checkMigrationLedgerParity("https://restoreassist-sandbox.vercel.app", {
    fetchImpl: stubFetch(200, deployed),
    root: repoWith(NAMES),
  });
  assert.equal(result.code, EXIT.DRIFT);
  assert.match(result.reason, /applied 2 migrations, repo has 3/);
});

test("fails as drift when the count matches but the names differ", async () => {
  const deployed = healthyPayload(["20260101_first", "20260202_second", "20260303_other"]);
  const result = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: stubFetch(200, deployed),
    root: repoWith(NAMES),
  });
  assert.equal(result.code, EXIT.DRIFT);
  assert.match(result.reason, /names differ/);
});

test("fails as drift on the 503 the sandbox returns today", async () => {
  const result = await checkMigrationLedgerParity("https://restoreassist-sandbox.vercel.app", {
    fetchImpl: stubFetch(503, {
      status: "drift",
      error: "Could not read the migration ledger",
      detail: "Migration health check failed",
    }),
    root: repoWith(NAMES),
  });
  assert.equal(result.code, EXIT.DRIFT);
  assert.match(result.reason, /"drift" \(HTTP 503\): Could not read the migration ledger/);
});

test("fails as drift when a migration failed or rolled back, even if the totals match", async () => {
  for (const counts of [
    { applied: 2, failed: 1, rolled_back: 0, total: 3 },
    { applied: 2, failed: 0, rolled_back: 1, total: 3 },
  ]) {
    const payload = { ...healthyPayload(NAMES), counts };
    const result = compareLedger(200, payload, expectedMigrationLedger(repoWith(NAMES)));
    assert.equal(result.code, EXIT.DRIFT, JSON.stringify(counts));
  }
});

test("fails as drift when an ok response has no valid ledger fingerprint", () => {
  const expected = expectedMigrationLedger(repoWith(NAMES));
  for (const migrationLedgerFingerprint of [undefined, null, "abc", "F".repeat(64)]) {
    const payload = { ...healthyPayload(NAMES), migrationLedgerFingerprint };
    assert.equal(compareLedger(200, payload, expected).code, EXIT.DRIFT);
  }
});

test("cannot check on a network error, and says so instead of passing", async () => {
  const result = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
    root: repoWith(NAMES),
  });
  assert.equal(result.code, EXIT.UNCHECKED);
  assert.match(result.reason, /request failed: TypeError/);
});

test("cannot check on a non-JSON body or a non-health error response", async () => {
  const html = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: stubFetch(502, "<html>Bad gateway</html>"),
    root: repoWith(NAMES),
  });
  assert.equal(html.code, EXIT.UNCHECKED);
  const limited = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: stubFetch(429, { error: "Too many requests" }),
    root: repoWith(NAMES),
  });
  assert.equal(limited.code, EXIT.UNCHECKED);
});

test("cannot check without a usable target or migrations directory", async () => {
  for (const base of [undefined, "", "not a url", "ftp://restoreassist.app"]) {
    const result = await checkMigrationLedgerParity(base, {
      fetchImpl: stubFetch(200, healthyPayload(NAMES)),
      root: repoWith(NAMES),
    });
    assert.equal(result.code, EXIT.UNCHECKED, String(base));
  }
  const empty = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: stubFetch(200, healthyPayload(NAMES)),
    root: repoWith([]),
  });
  assert.equal(empty.code, EXIT.UNCHECKED);
});

test("probe URL is always the origin's health route, whatever path was passed", () => {
  assert.equal(
    healthUrl("https://restoreassist.app/dashboard?x=1"),
    "https://restoreassist.app/api/health/migrations",
  );
});

test("CLI and results never carry a fingerprint", () => {
  // Drive the real CLI against a local unreachable port: exit 2, counts only.
  const run = spawnSync(process.execPath, [SCRIPT, "http://127.0.0.1:9"], { encoding: "utf8" });
  assert.equal(run.status, EXIT.UNCHECKED);
  assert.match(run.stderr, /FAIL \(could not check\) http:\/\/127\.0\.0\.1:9/);
  assert.doesNotMatch(run.stdout + run.stderr, /[0-9a-f]{64}/);

  const payload = healthyPayload(NAMES);
  const drift = compareLedger(200, payload, { count: 3, fingerprint: "e".repeat(64) });
  assert.equal(drift.code, EXIT.DRIFT);
  assert.doesNotMatch(JSON.stringify(drift), /[0-9a-f]{64}/);
});

// ------------------------------------------------- RA-8386: ahead policy
//
// The sandbox carries branch migrations applied by hand before they merge, so
// it can be ahead of main by design. Behind is the 08/10 sign-up incident and
// must still fail. Production stays strict: ahead or behind, it fails.

const MAIN = ["20260101_first", "20260202_second", "20260303_third"];
const SANDBOX_AHEAD = [...MAIN, "20260404_branch_only", "20260505_branch_only"];

for (const allowAhead of [false, true]) {
  const leg = allowAhead ? "sandbox (--allow-ahead)" : "production (strict)";

  test(`RA-8386 ${leg}: behind main fails as drift`, async () => {
    const result = await checkMigrationLedgerParity("https://restoreassist-sandbox.vercel.app", {
      fetchImpl: stubFetch(200, healthyPayload(MAIN.slice(0, 2))),
      root: repoWith(MAIN),
      allowAhead,
    });
    assert.equal(result.code, EXIT.DRIFT);
    assert.equal(result.verdict, "drift");
    assert.match(result.reason, /applied 2 migrations, repo has 3/);
  });

  test(`RA-8386 ${leg}: equal to main passes with no warning`, async () => {
    const result = await checkMigrationLedgerParity("https://restoreassist.app", {
      fetchImpl: stubFetch(200, healthyPayload(MAIN)),
      root: repoWith(MAIN),
      allowAhead,
    });
    assert.equal(result.code, EXIT.PASS);
    assert.equal(result.verdict, "pass");
  });

  test(`RA-8386 ${leg}: unreachable or unreadable is never a pass`, async () => {
    const network = await checkMigrationLedgerParity("https://restoreassist.app", {
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
      root: repoWith(MAIN),
      allowAhead,
    });
    assert.equal(network.code, EXIT.UNCHECKED);
    const html = await checkMigrationLedgerParity("https://restoreassist.app", {
      fetchImpl: stubFetch(502, "<html>Bad gateway</html>"),
      root: repoWith(MAIN),
      allowAhead,
    });
    assert.equal(html.code, EXIT.UNCHECKED);
  });

  test(`RA-8386 ${leg}: a database that cannot read its ledger is never a pass`, async () => {
    const result = await checkMigrationLedgerParity("https://restoreassist.app", {
      fetchImpl: stubFetch(503, { status: "drift", error: "Could not read the migration ledger" }),
      root: repoWith(MAIN),
      allowAhead,
    });
    assert.notEqual(result.code, EXIT.PASS);
  });

  test(`RA-8386 ${leg}: ahead with a failed or rolled-back migration still fails`, () => {
    const expected = expectedMigrationLedger(repoWith(MAIN));
    for (const counts of [
      { applied: 4, failed: 1, rolled_back: 0, total: 5 },
      { applied: 4, failed: 0, rolled_back: 1, total: 5 },
    ]) {
      const payload = { ...healthyPayload(SANDBOX_AHEAD), counts };
      assert.equal(
        compareLedger(200, payload, expected, { allowAhead }).code,
        EXIT.DRIFT,
        JSON.stringify(counts),
      );
    }
  });
}

test("RA-8386 production (strict): ahead of main fails as drift", async () => {
  const result = await checkMigrationLedgerParity("https://restoreassist.app", {
    fetchImpl: stubFetch(200, healthyPayload(SANDBOX_AHEAD)),
    root: repoWith(MAIN),
  });
  assert.equal(result.code, EXIT.DRIFT);
  assert.equal(result.verdict, "drift");
  assert.match(result.reason, /applied 5 migrations, repo has 3/);
});

test("RA-8386 sandbox (--allow-ahead): ahead of main warns, exits 0, and names the difference", async () => {
  const result = await checkMigrationLedgerParity("https://restoreassist-sandbox.vercel.app", {
    fetchImpl: stubFetch(200, healthyPayload(SANDBOX_AHEAD)),
    root: repoWith(MAIN),
    allowAhead: true,
  });
  assert.equal(result.code, EXIT.PASS);
  assert.equal(result.verdict, "ahead");
  assert.equal(result.aheadBy, 2);
  assert.match(result.reason, /applied 5 migrations, repo has 3 \(2 ahead\)/);
  // The public route publishes a count and a whole-ledger fingerprint only, so
  // it cannot prove every migration on main is among the applied ones. The
  // warning must say so rather than imply containment was checked.
  assert.match(result.reason, /cannot confirm/);
});

test("RA-8386 sandbox (--allow-ahead): ahead without a valid ledger fingerprint still fails", () => {
  const expected = expectedMigrationLedger(repoWith(MAIN));
  for (const migrationLedgerFingerprint of [undefined, "abc"]) {
    const payload = { ...healthyPayload(SANDBOX_AHEAD), migrationLedgerFingerprint };
    assert.equal(
      compareLedger(200, payload, expected, { allowAhead: true }).code,
      EXIT.DRIFT,
    );
  }
});

test("RA-8386 the ahead allowance is opt-in: compareLedger with no options stays strict", () => {
  const expected = expectedMigrationLedger(repoWith(MAIN));
  assert.equal(compareLedger(200, healthyPayload(SANDBOX_AHEAD), expected).code, EXIT.DRIFT);
  // Only the boolean true opts in. A string or number from config must not.
  for (const allowAhead of ["true", 1, "warn", {}]) {
    assert.equal(
      compareLedger(200, healthyPayload(SANDBOX_AHEAD), expected, { allowAhead }).code,
      EXIT.DRIFT,
      JSON.stringify(allowAhead),
    );
  }
});

// --- CLI, end to end against a local health server -----------------------

import { spawn } from "node:child_process";
import { createServer } from "node:http";

async function serveHealth(payload, status = 200) {
  const server = createServer((req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

function runCli(args, { cwd, env = {} } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd,
      env: { ...process.env, GITHUB_ACTIONS: "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => done({ status, stdout, stderr }));
  });
}

test("RA-8386 CLI: sandbox ahead exits 0 and prints a WARN line plus a GitHub warning annotation", async () => {
  const { server, origin } = await serveHealth(healthyPayload(SANDBOX_AHEAD));
  try {
    const run = await runCli([origin, "--allow-ahead"], {
      cwd: repoWith(MAIN),
      env: { GITHUB_ACTIONS: "true" },
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /\[migration-ledger-parity\] WARN \(ahead\) http:\/\/127\.0\.0\.1:\d+: applied 5 migrations, repo has 3 \(2 ahead\)/);
    assert.match(run.stdout, /^::warning title=Migration ledger ahead::.*2 ahead/m);
    assert.doesNotMatch(run.stdout + run.stderr, /[0-9a-f]{64}/);
  } finally {
    server.close();
  }
});

test("RA-8386 CLI: the same ahead ledger without --allow-ahead exits 1 (production stays strict)", async () => {
  const { server, origin } = await serveHealth(healthyPayload(SANDBOX_AHEAD));
  try {
    const run = await runCli([origin], { cwd: repoWith(MAIN) });
    assert.equal(run.status, EXIT.DRIFT, run.stdout + run.stderr);
    assert.match(run.stderr, /FAIL \(drift\)/);
  } finally {
    server.close();
  }
});

test("RA-8386 CLI: behind exits 1 even with --allow-ahead", async () => {
  const { server, origin } = await serveHealth(healthyPayload(MAIN.slice(0, 2)));
  try {
    const run = await runCli([origin, "--allow-ahead"], { cwd: repoWith(MAIN) });
    assert.equal(run.status, EXIT.DRIFT, run.stdout + run.stderr);
    assert.match(run.stderr, /FAIL \(drift\).*applied 2 migrations, repo has 3/);
  } finally {
    server.close();
  }
});

test("RA-8386 CLI: equal exits 0 with a PASS line and no warning, with or without --allow-ahead", async () => {
  const { server, origin } = await serveHealth(healthyPayload(MAIN));
  try {
    for (const args of [[origin], [origin, "--allow-ahead"]]) {
      const run = await runCli(args, { cwd: repoWith(MAIN), env: { GITHUB_ACTIONS: "true" } });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.match(run.stdout, /\] PASS /);
      assert.doesNotMatch(run.stdout + run.stderr, /::warning/);
    }
  } finally {
    server.close();
  }
});

test("RA-8386 CLI: unreadable exits 2 on both legs", async () => {
  for (const args of [["http://127.0.0.1:9"], ["http://127.0.0.1:9", "--allow-ahead"]]) {
    const run = await runCli(args, { cwd: repoWith(MAIN) });
    assert.equal(run.status, EXIT.UNCHECKED, args.join(" "));
    assert.match(run.stderr, /FAIL \(could not check\)/);
  }
});

test("RA-8386 CLI: an unknown flag or a second target is refused as could-not-check", async () => {
  for (const args of [
    ["http://127.0.0.1:9", "--allow-ahaed"],
    ["http://127.0.0.1:9", "http://127.0.0.1:10"],
  ]) {
    // Local dead ports: the test never reaches a real deployment.
    const run = await runCli(args, { cwd: repoWith(MAIN) });
    assert.equal(run.status, EXIT.UNCHECKED, args.join(" "));
    assert.match(run.stderr, /FAIL \(could not check\).*(unknown option|exactly one target)/);
  }
});
