import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { expectedMigrationLedger } from "../expected-migration-ledger.mjs";

test("migration ledger fingerprint is order-independent and population-bound", () => {
  const one = mkdtempSync(join(tmpdir(), "restoreassist-ledger-"));
  const two = mkdtempSync(join(tmpdir(), "restoreassist-ledger-"));
  for (const root of [one, two]) mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  for (const name of ["20260202_second", "20260101_first"]) {
    mkdirSync(join(one, "prisma", "migrations", name));
  }
  for (const name of ["20260101_first", "20260202_second"]) {
    mkdirSync(join(two, "prisma", "migrations", name));
  }
  assert.deepEqual(expectedMigrationLedger(one), expectedMigrationLedger(two));
  mkdirSync(join(two, "prisma", "migrations", "20260303_third"));
  assert.notDeepEqual(expectedMigrationLedger(one), expectedMigrationLedger(two));
});
