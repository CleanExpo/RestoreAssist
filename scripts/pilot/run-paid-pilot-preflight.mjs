import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadAndValidate } from "./validate-paid-pilot-package.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mode = process.argv[2] ?? "--list";
if (!["--list", "--run"].includes(mode)) {
  console.error(
    "usage: node scripts/pilot/run-paid-pilot-preflight.mjs [--list|--run]",
  );
  process.exit(2);
}

const { manifest, errors } = loadAndValidate(repoRoot);
if (errors.length) {
  for (const error of errors) console.error(`[paid-pilot] ${error}`);
  process.exit(1);
}

console.log(
  `[paid-pilot] origin=${manifest.productionOrigin} pilot=${manifest.pilotSize.minimum}-${manifest.pilotSize.maximum}`,
);
for (const group of manifest.groups) {
  console.log(`[paid-pilot] ${group.id} ${group.name}`);
  for (const testPath of group.tests) console.log(`  local: ${testPath}`);
  for (const testPath of group.releaseOnlyTests ?? [])
    console.log(`  release-only: ${testPath}`);
}

if (mode === "--list") process.exit(0);

let filesPassed = 0;
let testsPassed = 0;
for (const group of manifest.groups) {
  let groupTestsPassed = 0;
  // One process per file prevents process.env mutations in one suite from
  // racing another suite and turning this safety gate flaky.
  for (const testPath of group.tests) {
    const result = spawnSync(
      path.join(repoRoot, "node_modules/.bin/vitest"),
      [
        "run",
        "--config",
        "config/vitest.config.js",
        "--reporter=json",
        "--maxWorkers=1",
        testPath,
      ],
      { cwd: repoRoot, encoding: "utf8", env: process.env },
    );
    if (result.error) {
      console.error(
        `[paid-pilot] unable to start Vitest: ${result.error.message}`,
      );
      process.exit(1);
    }
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      console.error(
        `[paid-pilot] ${group.id} emitted an unreadable Vitest receipt for ${testPath}`,
      );
      process.stderr.write(result.stderr ?? "");
      process.stdout.write(result.stdout ?? "");
      process.exit(1);
    }
    if (
      report.success !== true ||
      report.numFailedTests !== 0 ||
      report.numPendingTests !== 0 ||
      report.numTodoTests !== 0 ||
      report.numPassedTests < 1
    ) {
      console.error(
        `[paid-pilot] ${group.id} FAIL file=${testPath} passed=${report.numPassedTests} failed=${report.numFailedTests} skipped=${report.numPendingTests} todo=${report.numTodoTests}`,
      );
      for (const testFile of report.testResults ?? []) {
        for (const assertion of testFile.assertionResults ?? []) {
          if (assertion.status !== "failed") continue;
          console.error(`[paid-pilot] failed: ${assertion.fullName}`);
          for (const message of assertion.failureMessages ?? []) {
            console.error(message.split("\n")[0]);
          }
        }
      }
      process.exit(1);
    }
    filesPassed += 1;
    groupTestsPassed += report.numPassedTests;
  }
  testsPassed += groupTestsPassed;
  console.log(`[paid-pilot] ${group.id} PASS (${groupTestsPassed} tests)`);
}
console.log(
  `[paid-pilot] deterministic local acceptance PASS (${filesPassed} files, ${testsPassed} tests)`,
);
console.log(
  "[paid-pilot] live A1-A6 acceptance remains required and was not attempted",
);
