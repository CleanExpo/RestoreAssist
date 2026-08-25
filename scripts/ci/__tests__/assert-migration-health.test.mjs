import assert from "node:assert/strict";
import test from "node:test";

import { assertMigrationHealthPayload } from "../assert-migration-health.mjs";

const fingerprint = "a".repeat(64);
const healthy = {
  status: "ok",
  databaseFingerprint: fingerprint,
  counts: { applied: 214, failed: 0, rolled_back: 0, total: 214 },
};

test("accepts a clean migration receipt for the proven database", () => {
  assert.equal(assertMigrationHealthPayload(healthy, fingerprint), true);
});

test("binds optional migration count and ledger fingerprint", () => {
  const ledger = "c".repeat(64);
  const payload = { ...healthy, migrationLedgerFingerprint: ledger };
  assert.equal(assertMigrationHealthPayload(payload, fingerprint, 214, ledger), true);
  assert.throws(
    () => assertMigrationHealthPayload(payload, fingerprint, 215, ledger),
    /count does not match/,
  );
  assert.throws(
    () => assertMigrationHealthPayload(payload, fingerprint, 214, "d".repeat(64)),
    /ledger fingerprint/,
  );
});

test("rejects drift, the wrong database, an empty ledger and missing trust anchor", () => {
  assert.throws(
    () => assertMigrationHealthPayload({ ...healthy, status: "drift" }, fingerprint),
    /not ok/,
  );
  assert.throws(
    () =>
      assertMigrationHealthPayload(
        { ...healthy, databaseFingerprint: "b".repeat(64) },
        fingerprint,
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      assertMigrationHealthPayload(
        { ...healthy, counts: { applied: 0, failed: 0, rolled_back: 0, total: 0 } },
        fingerprint,
      ),
    /clean applied ledger/,
  );
  assert.throws(() => assertMigrationHealthPayload(healthy, ""), /64-character/);
});
