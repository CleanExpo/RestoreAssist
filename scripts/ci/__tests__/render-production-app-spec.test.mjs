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
