#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIGEST_SENTINEL = `sha256:${"0".repeat(64)}`;
export const SHA_SENTINEL = "0".repeat(40);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requireObject(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must be an object`);
  }
  return value;
}

export function renderProductionAppSpec({ template, digest, gitSha, registryCredentials }) {
  if (!DIGEST_PATTERN.test(digest) || digest === DIGEST_SENTINEL) {
    throw new Error("image digest must be a non-sentinel lowercase sha256 digest");
  }
  if (!SHA_PATTERN.test(gitSha) || gitSha === SHA_SENTINEL) {
    throw new Error("Git SHA must be a non-sentinel full lowercase commit SHA");
  }
  if (
    typeof registryCredentials !== "string" ||
    registryCredentials.length < 3 ||
    registryCredentials.length > 4096 ||
    !registryCredentials.includes(":") ||
    /[\r\n]/.test(registryCredentials)
  ) {
    throw new Error("GHCR pull credentials must use a single-line username:token value");
  }

  const spec = structuredClone(requireObject(template, "app spec"));
  if (spec.name !== "restore-assist" || spec.region !== "syd") {
    throw new Error("app name and region must remain restore-assist@syd");
  }
  if (
    JSON.stringify(spec.domains) !==
    JSON.stringify([{ domain: "restoreassist.app", type: "PRIMARY" }])
  ) {
    throw new Error("production app spec must bind exactly the canonical primary domain");
  }
  if (!Array.isArray(spec.services) || spec.services.length !== 1) {
    throw new Error("production app spec must contain exactly one service");
  }
  const service = requireObject(spec.services[0], "services[0]");
  if (service.name !== "web") throw new Error("the only production service must be web");
  for (const mutableSource of ["github", "git", "gitlab", "bitbucket", "tag"]) {
    if (Object.hasOwn(service, mutableSource)) {
      throw new Error(`services/web contains forbidden mutable source ${mutableSource}`);
    }
  }
  const image = requireObject(service.image, "services/web.image");
  const expectedImage = {
    registry_type: "GHCR",
    registry: "cleanexpo",
    repository: "restoreassist",
    registry_credentials: "${GHCR_PULL_CREDENTIALS}",
    digest: DIGEST_SENTINEL,
  };
  if (JSON.stringify(image) !== JSON.stringify(expectedImage)) {
    throw new Error("services/web.image does not match the reviewed immutable template");
  }
  // READINESS, NOT DRIFT.
  //
  // This pinned /api/health/migrations, which is a migration-drift watchdog --
  // its own docstring calls it a probe for "UptimeRobot, Pi-Dev-Ops watchdog,
  // manual probe". Using it as the container health check conflates two
  // different questions: "can this container serve traffic?" and "is the
  // database ledger in the expected state?". A container can be perfectly
  // healthy while the database has drift, and that endpoint answers 503 on any
  // drift and 504 when it is slow -- which makes App Platform fail the
  // deployment and roll back.
  //
  // Worse, it deadlocks: if drift ever exists, the deploy that would FIX the
  // drift cannot go out, because the health check refuses to go green until the
  // drift is gone. Drift gating belongs at the deploy gate (`prisma migrate
  // status`), which is exactly what that endpoint's docstring says.
  //
  // /api/health is the right probe: one `SELECT 1`, memory-only rate limiting,
  // and 503 only when a check is in `error`. It still fails a container that
  // cannot reach its database, which is what readiness means.
  if (service.health_check?.http_path !== "/api/health") {
    throw new Error("services/web health check must use /api/health");
  }
  // The timings are pinned too, and this half is not cosmetic. Omitting them
  // inherits App Platform's defaults -- a 1-SECOND timeout with no startup
  // grace -- against an endpoint that opens a database connection, on a
  // basic-xxs instance. Leaving them unset is how a correct health path still
  // fails every deploy, so the guard must refuse a spec that drops them.
  const health = requireObject(service.health_check, "services/web.health_check");
  const minimums = {
    initial_delay_seconds: 30,
    period_seconds: 5,
    timeout_seconds: 5,
    failure_threshold: 3,
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    const observed = health[key];
    if (typeof observed !== "number" || observed < minimum) {
      throw new Error(
        `services/web health check ${key} must be a number >= ${minimum}; observed ${JSON.stringify(observed)}`,
      );
    }
  }
  const gitShaEnv = service.envs?.find((entry) => entry?.key === "GIT_SHA");
  if (
    !gitShaEnv ||
    JSON.stringify(gitShaEnv) !==
      JSON.stringify({
        key: "GIT_SHA",
        value: SHA_SENTINEL,
        scope: "RUN_AND_BUILD_TIME",
        type: "GENERAL",
      })
  ) {
    throw new Error("services/web GIT_SHA must use the reviewed sentinel contract");
  }

  image.digest = digest;
  image.registry_credentials = registryCredentials;
  gitShaEnv.value = gitSha;
  return spec;
}

export function redactedReleaseReceipt(spec, digest, gitSha) {
  const redacted = structuredClone(spec);
  redacted.services[0].image.registry_credentials = "[REDACTED]";
  const canonical = `${JSON.stringify(redacted, null, 2)}\n`;
  return {
    schema: 1,
    repository: "CleanExpo/RestoreAssist",
    git_sha: gitSha,
    image_digest: digest,
    app_name: "restore-assist",
    region: "syd",
    production_origin: "https://restoreassist.app",
    rendered_spec_sha256: createHash("sha256").update(canonical).digest("hex"),
    rendered_spec_redacted: redacted,
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 3) {
    console.error(
      "usage: render-production-app-spec.mjs <digest> <rendered-spec-path> <redacted-receipt-path>",
    );
    return 2;
  }
  const [digest, outputPath, receiptPath] = argv;
  const gitSha = process.env.GITHUB_SHA?.trim() ?? "";
  const registryCredentials = process.env.GHCR_PULL_CREDENTIALS ?? "";
  const templatePath = resolve(".do/app.yaml");
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  const spec = renderProductionAppSpec({ template, digest, gitSha, registryCredentials });
  const receipt = redactedReleaseReceipt(spec, digest, gitSha);
  writeFileSync(resolve(outputPath), `${JSON.stringify(spec, null, 2)}\n`, { mode: 0o600 });
  chmodSync(resolve(outputPath), 0o600);
  writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(
    `[production-spec] PASS ${receipt.repository}@${gitSha} -> ${digest} (${receipt.app_name}@${receipt.region})`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
