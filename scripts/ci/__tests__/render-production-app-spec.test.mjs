import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DIGEST_SENTINEL,
  SHA_SENTINEL,
  redactedReleaseReceipt,
  renderProductionAppSpec,
} from "../render-production-app-spec.mjs";

const template = JSON.parse(readFileSync(".do/app.yaml", "utf8"));
const digest = `sha256:${"a".repeat(64)}`;
const gitSha = "b".repeat(40);

test("renders an exact digest and commit without retaining template sentinels", () => {
  const rendered = renderProductionAppSpec({
    template,
    digest,
    gitSha,
    registryCredentials: "restoreassist-pull:token",
  });
  assert.equal(rendered.services[0].image.digest, digest);
  assert.equal(rendered.services[0].envs.find((entry) => entry.key === "GIT_SHA").value, gitSha);
  assert.doesNotMatch(JSON.stringify(rendered), new RegExp(DIGEST_SENTINEL));
  assert.doesNotMatch(JSON.stringify(rendered), new RegExp(SHA_SENTINEL));
});

test("redacts pull credentials from the retained release receipt", () => {
  const rendered = renderProductionAppSpec({
    template,
    digest,
    gitSha,
    registryCredentials: "restoreassist-pull:secret-value",
  });
  const receipt = redactedReleaseReceipt(rendered, digest, gitSha);
  assert.equal(receipt.rendered_spec_redacted.services[0].image.registry_credentials, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(receipt), /secret-value/);
});

test("rejects mutable, uppercase, sentinel, and truncated release identities", () => {
  for (const invalidDigest of [
    DIGEST_SENTINEL,
    "latest",
    `sha256:${"A".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
  ]) {
    assert.throws(
      () =>
        renderProductionAppSpec({
          template,
          digest: invalidDigest,
          gitSha,
          registryCredentials: "user:token",
        }),
      /digest/,
    );
  }
  for (const invalidSha of [SHA_SENTINEL, "b".repeat(39), "B".repeat(40)]) {
    assert.throws(
      () =>
        renderProductionAppSpec({
          template,
          digest,
          gitSha: invalidSha,
          registryCredentials: "user:token",
        }),
      /Git SHA/,
    );
  }
});

test("rejects any branch source or weakened health contract", () => {
  const branchTemplate = structuredClone(template);
  branchTemplate.services[0].github = { repo: "CleanExpo/RestoreAssist", branch: "main" };
  assert.throws(
    () =>
      renderProductionAppSpec({
        template: branchTemplate,
        digest,
        gitSha,
        registryCredentials: "user:token",
      }),
    /mutable source/,
  );

  const weakHealth = structuredClone(template);
  weakHealth.services[0].health_check.http_path = "/";
  assert.throws(
    () =>
      renderProductionAppSpec({
        template: weakHealth,
        digest,
        gitSha,
        registryCredentials: "user:token",
      }),
    /health check/,
  );
});

test("rejects a health check that omits or weakens its timings", () => {
  // The failure this exists for. The original spec named only `http_path`, so
  // App Platform applied its DEFAULTS -- a 1-second timeout with no startup
  // grace -- against an endpoint that opens a database connection, on a
  // basic-xxs instance. A correct health path still fails every deploy if the
  // timings are missing, so dropping them must be rejected as loudly as
  // pointing the probe somewhere useless.
  const noTimings = structuredClone(template);
  noTimings.services[0].health_check = { http_path: "/api/health" };
  assert.throws(
    () =>
      renderProductionAppSpec({
        template: noTimings,
        digest,
        gitSha,
        registryCredentials: "user:token",
      }),
    /initial_delay_seconds must be a number >= 30/,
  );

  for (const [key, weakened] of [
    ["initial_delay_seconds", 5],
    ["timeout_seconds", 1],
    ["failure_threshold", 1],
  ]) {
    const weak = structuredClone(template);
    weak.services[0].health_check[key] = weakened;
    assert.throws(
      () =>
        renderProductionAppSpec({
          template: weak,
          digest,
          gitSha,
          registryCredentials: "user:token",
        }),
      new RegExp(`${key} must be a number >=`),
      `weakening ${key} to ${weakened} must be rejected`,
    );
  }
});

test("keeps the probe on readiness, not on the migration-drift watchdog", () => {
  // /api/health/migrations answers "is the ledger in the expected state?", not
  // "can this container serve traffic?". Pointing the probe back at it
  // reintroduces a deadlock: with drift present, the deploy that would fix the
  // drift can never go green.
  const driftProbe = structuredClone(template);
  driftProbe.services[0].health_check.http_path = "/api/health/migrations";
  assert.throws(
    () =>
      renderProductionAppSpec({
        template: driftProbe,
        digest,
        gitSha,
        registryCredentials: "user:token",
      }),
    /must use \/api\/health/,
  );
});
