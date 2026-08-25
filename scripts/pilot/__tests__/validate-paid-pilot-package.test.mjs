import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateManifest } from "../validate-paid-pilot-package.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "paid-pilot-"));
  const groups = [
    ["A1", "signup"],
    ["A2", "payment"],
    ["A3", "invites"],
    ["A4", "reports"],
    ["A5", "email"],
    ["A6", "tenant-provisioning"],
  ].map(([id, name]) => {
    const testPath = `tests/${id}.test.ts`;
    mkdirSync(path.dirname(path.join(root, testPath)), { recursive: true });
    writeFileSync(path.join(root, testPath), "// fixture\n");
    return { id, name, tests: [testPath], liveRequired: true };
  });
  return {
    root,
    manifest: {
      schemaVersion: 1,
      pilotSize: { minimum: 3, maximum: 5 },
      productionOrigin: "https://restoreassist.app",
      groups,
    },
  };
}

test("accepts the exact six-group paid-pilot contract", () => {
  const { root, manifest } = fixture();
  assert.deepEqual(validateManifest(manifest, root), []);
});

test("fails closed when payment acceptance is removed", () => {
  const { root, manifest } = fixture();
  manifest.groups = manifest.groups.filter((group) => group.id !== "A2");
  assert.match(
    validateManifest(manifest, root).join("\n"),
    /missing required group A2/,
  );
});

test("fails closed when live acceptance is disabled", () => {
  const { root, manifest } = fixture();
  manifest.groups[0].liveRequired = false;
  assert.match(
    validateManifest(manifest, root).join("\n"),
    /A1 must require live acceptance/,
  );
});

test("fails closed when a test path is missing or escapes the repository", () => {
  const { root, manifest } = fixture();
  manifest.groups[0].tests = ["../outside.test.ts", "tests/missing.test.ts"];
  const errors = validateManifest(manifest, root).join("\n");
  assert.match(errors, /unsafe test path/);
  assert.match(errors, /test does not exist/);
});

test("fails closed for a non-canonical production origin", () => {
  const { root, manifest } = fixture();
  manifest.productionOrigin = "https://example.invalid";
  assert.match(
    validateManifest(manifest, root).join("\n"),
    /production origin/,
  );
});
