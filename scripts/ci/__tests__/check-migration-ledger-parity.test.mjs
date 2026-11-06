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
} from "../check-migration-ledger-parity.mjs";
import { expectedMigrationLedger } from "../expected-migration-ledger.mjs";

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
