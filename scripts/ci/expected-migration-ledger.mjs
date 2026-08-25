#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function expectedMigrationLedger(root = process.cwd()) {
  const directory = resolve(root, "prisma", "migrations");
  const names = readdirSync(directory)
    .filter((name) => {
      const stat = lstatSync(resolve(directory, name));
      return stat.isDirectory() && !stat.isSymbolicLink();
    })
    .sort();
  if (names.length === 0) throw new Error("reviewed migration population is empty");
  const hash = createHash("sha256");
  hash.update("restoreassist-migration-ledger-v1");
  for (const name of names) hash.update(`\0${name}`);
  return { count: names.length, fingerprint: hash.digest("hex") };
}

function main() {
  try {
    const receipt = expectedMigrationLedger();
    const githubEnv = process.env.GITHUB_ENV;
    if (!githubEnv) throw new Error("GITHUB_ENV is required");
    appendFileSync(
      githubEnv,
      `EXPECTED_MIGRATION_COUNT=${receipt.count}\n` +
        `EXPECTED_MIGRATION_LEDGER_FINGERPRINT=${receipt.fingerprint}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    console.log(`[migration-ledger] PASS ${receipt.count} reviewed migrations`);
    return 0;
  } catch (error) {
    console.error(`[migration-ledger] FAIL: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
