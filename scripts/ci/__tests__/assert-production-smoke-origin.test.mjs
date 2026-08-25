import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_ORIGIN,
  assertProductionSmokeOrigin,
} from "../assert-production-smoke-origin.mjs";

test("accepts only the canonical production origin", () => {
  assert.equal(assertProductionSmokeOrigin(PRODUCTION_ORIGIN), PRODUCTION_ORIGIN);
});

test("rejects a healthy arbitrary HTTPS host and canonical lookalikes", () => {
  for (const decoy of [
    "https://healthy-decoy.example",
    "https://restoreassist.app.evil.example",
    "http://restoreassist.app",
    "https://restoreassist.app:444",
    "https://restoreassist.app/smoke-decoy",
    "https://user@restoreassist.app",
  ]) {
    assert.throws(() => assertProductionSmokeOrigin(decoy), /must be exactly|invalid/);
  }
});

test("rejects missing and extra arguments at the executable boundary", async () => {
  const { main } = await import("../assert-production-smoke-origin.mjs");
  assert.equal(main([]), 1);
  assert.equal(main([PRODUCTION_ORIGIN, "https://healthy-decoy.example"]), 1);
});
