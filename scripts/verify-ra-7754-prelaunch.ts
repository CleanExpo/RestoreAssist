#!/usr/bin/env npx tsx
/**
 * RA-7754 — static + optional test verification for all four prelaunch slices.
 *
 *   npm run script:verify-ra-7754
 *   npm run script:verify-ra-7754 -- --run-tests
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const runTests = process.argv.includes("--run-tests");

function mustExist(relative: string) {
  const full = path.join(repoRoot, relative);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing expected file: ${relative}`);
  }
}

function mustMatch(relative: string, pattern: RegExp) {
  const full = path.join(repoRoot, relative);
  const text = fs.readFileSync(full, "utf8");
  if (!pattern.test(text)) {
    throw new Error(`Pattern ${pattern} not found in ${relative}`);
  }
}

console.log("RA-7754 prelaunch verification (static)…");

mustExist("prisma/migrations/20260926090000_d022_invoice_number_unique_per_owner/migration.sql");
mustExist("prisma/migrations/20260926090100_d030_scope_item_source/migration.sql");
mustMatch("lib/auth/assert-tenancy.ts", /export async function canLinkRecord/);
mustMatch("app/api/invoices/[id]/route.ts", /D-025/);
mustMatch("app/api/inspections/[id]/generate-scope/route.ts", /ai_generate_scope/);
mustExist(
  "app/api/invoices/__tests__/prelaunch-tenancy-numbering.integration.test.ts",
);
mustExist(
  "app/api/inspections/[id]/generate-scope/__tests__/regenerate-keeps-manual-items.integration.test.ts",
);

console.log("Static checks: OK");

if (runTests) {
  const tests = [
    "app/api/invoices/__tests__/technician-money-gate.test.ts",
    "app/api/invoices/__tests__/prelaunch-tenancy-numbering.integration.test.ts",
    "app/api/inspections/[id]/generate-scope/__tests__/regenerate-keeps-manual-items.integration.test.ts",
  ];
  console.log("Running vitest (requires DATABASE_URL for integration files)…");
  execSync(`npm run test:unit -- ${tests.join(" ")}`, {
    cwd: repoRoot,
    stdio: "inherit",
  });
} else {
  console.log(
    "Tip: run with --run-tests to execute D-021/D-022/D-025/D-030 vitest proofs.",
  );
}

console.log("RA-7754 verify: PASS");
