import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_PRODUCTION_REVIEWERS,
  main,
  verifyProductionEnvironment,
} from "../verify-production-environment.mjs";

function protectedEnvironment(overrides = {}) {
  return {
    name: "production",
    can_admins_bypass: false,
    protection_rules: [
      {
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [{ type: "User", reviewer: { login: "release-owner" } }],
      },
    ],
    ...overrides,
  };
}

test("accepts a production environment with an independent required reviewer", () => {
  const payload = protectedEnvironment();
  assert.equal(verifyProductionEnvironment(payload, ["User:release-owner"]), payload);
});

test("rejects an unprotected environment and self-approval", () => {
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment({ can_admins_bypass: true }), ["User:release-owner"]),
    /can_admins_bypass=false/,
  );
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment({ protection_rules: [] }), ["User:release-owner"]),
    /exactly one required-reviewers rule/,
  );
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment({
      protection_rules: [{
        type: "required_reviewers",
        prevent_self_review: false,
        reviewers: [{ type: "User", reviewer: { login: "release-owner" } }],
      }],
    }), ["User:release-owner"]),
    /prevent self-review/,
  );
});

test("rejects an empty or malformed reviewer population", () => {
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment({
      protection_rules: [{
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [],
      }],
    }), ["User:release-owner"]),
    /at least one required reviewer/,
  );
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment({
      protection_rules: [{
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [{ type: "Webhook", reviewer: null }],
      }],
    }), ["User:release-owner"]),
    /invalid required reviewer/,
  );
});

test("rejects an empty or mismatched reviewer allow-list", () => {
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment(), []),
    /allow-list is empty/,
  );
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment(), ["User:someone-else"]),
    /reviewer mismatch/,
  );
});

test("executable fails closed while the versioned reviewer trust anchor is unconfigured", () => {
  assert.deepEqual(APPROVED_PRODUCTION_REVIEWERS, []);
  assert.throws(
    () => verifyProductionEnvironment(protectedEnvironment()),
    /allow-list is empty/,
  );
  assert.equal(main([]), 1);
});
