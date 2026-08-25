#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No independent production reviewer identity has yet been confirmed for this
// personal-account repository. Keep this versioned trust anchor empty until a
// separately controlled GitHub team/user is explicitly approved. A repository
// variable is not a trust anchor because repository admins can rewrite it.
export const APPROVED_PRODUCTION_REVIEWERS = Object.freeze([]);

export function verifyProductionEnvironment(
  payload,
  expectedReviewers = APPROVED_PRODUCTION_REVIEWERS,
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("production environment receipt is not a JSON object");
  }
  if (payload.name !== "production") {
    throw new Error(
      `deployment environment must be named production; observed ${JSON.stringify(payload.name)}`,
    );
  }
  if (payload.can_admins_bypass !== false) {
    throw new Error("production environment must set can_admins_bypass=false");
  }
  if (!Array.isArray(payload.protection_rules)) {
    throw new Error("production environment exposes no protection rules");
  }
  const reviewerRules = payload.protection_rules.filter(
    (rule) =>
      rule && typeof rule === "object" && rule.type === "required_reviewers",
  );
  if (reviewerRules.length !== 1) {
    throw new Error(
      "production environment must have exactly one required-reviewers rule",
    );
  }
  const rule = reviewerRules[0];
  if (rule.prevent_self_review !== true) {
    throw new Error("production environment must prevent self-review");
  }
  if (!Array.isArray(rule.reviewers) || rule.reviewers.length === 0) {
    throw new Error(
      "production environment must have at least one required reviewer",
    );
  }
  if (!Array.isArray(expectedReviewers) || expectedReviewers.length === 0) {
    throw new Error("expected production reviewer allow-list is empty");
  }
  const expected = new Set(expectedReviewers.map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (expected.size === 0) {
    throw new Error("expected production reviewer allow-list is empty");
  }
  const observed = new Set();
  for (const entry of rule.reviewers) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !["User", "Team"].includes(entry.type) ||
      !entry.reviewer ||
      typeof entry.reviewer !== "object"
    ) {
      throw new Error(
        "production environment contains an invalid required reviewer",
      );
    }
    const identity = entry.type === "User" ? entry.reviewer.login : entry.reviewer.slug;
    if (typeof identity !== "string" || !identity.trim()) {
      throw new Error("production environment reviewer has no stable identity");
    }
    observed.add(`${entry.type}:${identity.trim()}`.toLowerCase());
  }
  if (
    observed.size !== rule.reviewers.length ||
    observed.size !== expected.size ||
    [...observed].some((identity) => !expected.has(identity))
  ) {
    throw new Error(
      `production environment reviewer mismatch; expected ${[...expected].sort().join(",")}, observed ${[...observed].sort().join(",")}`,
    );
  }
  return payload;
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 1) {
      throw new Error(
        "usage: verify-production-environment.mjs <environment.json>",
      );
    }
    const payload = JSON.parse(readFileSync(argv[0], "utf8"));
    verifyProductionEnvironment(payload);
    console.log(
      "[production-environment] PASS required reviewer + self-review prevention + admin bypass disabled",
    );
    return 0;
  } catch (error) {
    console.error(
      `[production-environment] FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
