import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { findDrift, readManifest } from "../run-mjs-tests.mjs";

function manifestFile(lines) {
  const dir = mkdtempSync(path.join(tmpdir(), "ra-mjs-manifest-"));
  const file = path.join(dir, "manifest.txt");
  writeFileSync(file, lines.join("\n"), "utf8");
  return file;
}

test("every known disposition kind is accepted", () => {
  const parsed = readManifest(
    manifestFile([
      "# a comment",
      "",
      "scripts/ci/__tests__/a.test.mjs   run",
      "scripts/ci/__tests__/b.test.mjs   elsewhere:smoke-prod.yml runs it",
      "scripts/ci/__tests__/c.test.mjs   skip:needs a live database",
    ]),
  );
  assert.equal(parsed.size, 3);
  assert.equal(parsed.get("scripts/ci/__tests__/a.test.mjs"), "run");
});

// Independent review (independent cross-vendor review, 2026-09-07) — P1.
// main() buckets suites with `=== "run"`, `startsWith("elsewhere:")` and
// `startsWith("skip:")`. A disposition matching none of those put the suite in
// no bucket at all: it was neither run nor reported, and the gate still exited
// 0. A typo was the one way to disarm a suite without the drift check noticing,
// because the file WAS mentioned in the manifest.
test("a disposition that is not a known kind is rejected", () => {
  assert.throws(
    () => readManifest(manifestFile(["scripts/ci/__tests__/a.test.mjs   runn"])),
    /unknown disposition/i,
  );
  assert.throws(
    () => readManifest(manifestFile(["scripts/ci/__tests__/a.test.mjs   skip"])),
    /unknown disposition/i,
  );
  assert.throws(
    () =>
      readManifest(manifestFile(["scripts/ci/__tests__/a.test.mjs   elsewhere"])),
    /unknown disposition/i,
  );
});

test("a prefix disposition with no reason after it is rejected", () => {
  assert.throws(
    () => readManifest(manifestFile(["scripts/ci/__tests__/a.test.mjs   skip:"])),
    /unknown disposition/i,
  );
});

test("a manifest entry with no disposition at all is still rejected", () => {
  assert.throws(
    () => readManifest(manifestFile(["scripts/ci/__tests__/a.test.mjs"])),
    /disposition/,
  );
});

test("drift is reported in both directions", () => {
  const manifest = new Map([["on-disk.test.mjs", "run"], ["gone.test.mjs", "run"]]);
  const drift = findDrift(["on-disk.test.mjs", "new.test.mjs"], manifest);
  assert.deepEqual(drift.unmentioned, ["new.test.mjs"]);
  assert.deepEqual(drift.missing, ["gone.test.mjs"]);
});
