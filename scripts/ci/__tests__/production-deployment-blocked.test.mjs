import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = readFileSync(
  new URL("../../../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);
const imageWorkflow = readFileSync(
  new URL("../../../.github/workflows/build-production-image.yml", import.meta.url),
  "utf8",
);
const oauthNative = readFileSync(
  new URL("../../../lib/oauth-native.ts", import.meta.url),
  "utf8",
);
const releaseGateWorkflow = readFileSync(
  new URL("../../../.github/workflows/release-gate.yml", import.meta.url),
  "utf8",
);
const productionSmoke = readFileSync(
  new URL(
    "../../../docs/archive/playwright-e2e/pilot-workflow.spec.ts",
    import.meta.url,
  ),
  "utf8",
);
const parityWorkflow = readFileSync(
  new URL("../../../.github/workflows/deploy-check.yml", import.meta.url),
  "utf8",
);
const appSpec = readFileSync(
  new URL("../../../.do/app.yaml", import.meta.url),
  "utf8",
);
const smokeWorkflow = readFileSync(
  new URL("../../../.github/workflows/smoke-prod.yml", import.meta.url),
  "utf8",
);
const playwrightConfig = readFileSync(
  new URL("../../../config/playwright.config.ts", import.meta.url),
  "utf8",
);

test("production workflow binds build, approval, activation and rollback to exact evidence", () => {
  const parsed = parse(workflow);
  assert.equal(parsed.concurrency.group, "digitalocean-production");
  assert.equal(parsed.concurrency["cancel-in-progress"], false);
  assert.equal(parsed.jobs.build.environment, undefined);
  assert.equal(parsed.jobs.deploy.environment.name, "production");
  assert.equal(parsed.jobs.deploy.needs, "build");
  assert.equal(parsed.on.workflow_dispatch.inputs.confirm_sha.required, true);
  assert.equal(parsed.on.workflow_dispatch.inputs.release_gate_run_id.required, true);
  assert.match(workflow, /verify-release-gate-run\.mjs/);
  assert.match(workflow, /docker buildx build[\s\S]*--push/);
  assert.match(workflow, /actions\/attest@[0-9a-f]{40}/);
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /render-production-app-spec\.mjs/);
  assert.match(workflow, /digitalocean-production-release\.py preflight/);
  assert.match(workflow, /verify-production-migrations\.sh/);
  assert.match(workflow, /digitalocean-production-release\.py deploy/);
  assert.match(workflow, /Post-activation smoke failed; rolling back/);
  assert.match(workflow, /digitalocean-production-release\.py rollback/);
  // Until 26/08/2026 this asserted an unconditional `exit 1` here, which made
  // the workflow undeployable by design. That block has been relaxed; the
  // accepted risk is now recorded instead of refused. The live replacement for
  // these invariants is scripts/__tests__/production-release-path.test.ts --
  // this file is a .test.mjs and config/vitest.config.js never runs it.
  const riskRecord = workflow.indexOf("Record the accepted runner-loss risk");
  const firstProviderCredential = workflow.indexOf("DIGITALOCEAN_ACCESS_TOKEN");
  assert.ok(riskRecord > 0 && riskRecord < firstProviderCredential);
  assert.match(workflow.slice(riskRecord, firstProviderCredential), /::warning/);
  const buildJob = workflow.slice(workflow.indexOf("  build:"), workflow.indexOf("  reject-non-main:"));
  assert.doesNotMatch(buildJob, /DIGITALOCEAN_ACCESS_TOKEN|DIGITALOCEAN_APP_ID|PRODUCTION_DIRECT_URL/);
});

test("production image builds bind the versioned public OAuth client fallback", () => {
  const publicClientId = oauthNative.match(
    /[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/,
  )?.[0];
  assert.ok(publicClientId, "lib/oauth-native.ts must expose the reviewed public client ID");
  assert.ok(workflow.includes(publicClientId));
  assert.ok(imageWorkflow.includes(publicClientId));
});

test("reviewed app template is immutable, non-deployable and secret-free", () => {
  const spec = parse(appSpec);
  const service = spec.services[0];
  assert.equal(service.image.registry_type, "GHCR");
  assert.equal(service.image.registry, "cleanexpo");
  assert.equal(service.image.repository, "restoreassist");
  assert.equal(service.image.digest, `sha256:${"0".repeat(64)}`);
  assert.equal(service.image.registry_credentials, "${GHCR_PULL_CREDENTIALS}");
  assert.equal(service.image.tag, undefined);
  assert.equal(service.image.deploy_on_push, undefined);
  assert.equal(service.github, undefined);
  // Readiness, not drift. /api/health/migrations is a migration-drift watchdog;
  // using it as App Platform's health check meant any drift -- or a slow query
  // on a cold basic-xxs container under the default 1s timeout -- failed the
  // deployment and rolled it back, including the deploy that would have fixed
  // the drift. See render-production-app-spec.mjs for the full reasoning.
  assert.equal(service.health_check.http_path, "/api/health");
  // The timings are part of the contract: naming only http_path inherits App
  // Platform's defaults, which is how a correct path still fails every deploy.
  assert.ok(service.health_check.initial_delay_seconds >= 30);
  assert.ok(service.health_check.timeout_seconds >= 5);
  assert.ok(service.health_check.failure_threshold >= 3);
  for (const entry of service.envs.filter((item) => item.type === "SECRET")) {
    assert.equal(Object.hasOwn(entry, "value"), false, `${entry.key} must be hydrated only in memory`);
  }
});

test("discovers every DigitalOcean component and permits only the reviewed digest template", () => {
  const spec = parse(appSpec);
  const componentKinds = [
    "services",
    "workers",
    "jobs",
    "functions",
    "static_sites",
    "databases",
  ];
  const discovered = componentKinds.flatMap((kind) =>
    (Array.isArray(spec[kind]) ? spec[kind] : []).map((component) => ({ kind, component })),
  );
  assert.ok(discovered.length > 0, "component discovery must not be empty");
  assert.deepEqual(
    discovered.map(({ kind, component }) => `${kind}:${component.name}`),
    ["services:web"],
  );
  const runnable = discovered.filter(({ kind }) => kind !== "databases");
  for (const { kind, component } of runnable) {
    assert.match(component.image?.digest ?? "", /^sha256:[0-9a-f]{64}$/);
    assert.equal(component.image.digest, `sha256:${"0".repeat(64)}`);
    for (const field of ["github", "git", "gitlab", "bitbucket", "tag"]){
      assert.equal(component[field] ?? component.image?.[field], undefined, `${kind}:${component.name} has ${field}`);
    }
  }
});

test("read-only readiness access is main-only, content-bound and non-acting", () => {
  const parsed = parse(parityWorkflow);
  assert.match(parsed.jobs["reject-non-main"].steps[0].run, /exit 1/);
  assert.doesNotMatch(parsed.jobs.evidence.steps.at(-1).run, /exit 1/);
  assert.match(parityWorkflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(parityWorkflow, /verify-release-provenance\.mjs/);
  assert.match(parityWorkflow, /verify-production-environment\.mjs/);
  assert.match(parityWorkflow, /verify-release-gate-run\.mjs/);
  assert.match(parityWorkflow, /actions\/artifacts\/\$\{ARTIFACT_ID\}\/zip/);
  assert.match(parityWorkflow, /release-gate-report\.zip/);
  assert.doesNotMatch(parityWorkflow, /\bunzip\b/);
  assert.doesNotMatch(parityWorkflow, /release-gate-report\.json/);
  assert.doesNotMatch(parityWorkflow, /PRODUCTION_RELEASE_REVIEWERS|vars\./);
  assert.match(parityWorkflow, /versioned trust policy/);
  assert.match(parityWorkflow, /Reject non-main readiness request[\s\S]*exit 1/);
  assert.match(parityWorkflow, /Report read-only readiness/);
  assert.doesNotMatch(
    parityWorkflow,
    /create-deployment|trigger_digitalocean|DIGITALOCEAN_ACCESS_TOKEN|DIGITALOCEAN_APP_ID|secrets\./,
  );
});

test("release-gate success cannot omit its report artifact", () => {
  assert.match(
    releaseGateWorkflow,
    /name: release-gate-report-\$\{\{ github\.sha \}\}[\s\S]*if-no-files-found: error/,
  );
  assert.doesNotMatch(
    releaseGateWorkflow,
    /SMOKE_TEST_BOT_BYPASS_SECRET|x-smoke-test-token/,
  );
});

test("production smoke cannot pass when guarded routes or health are absent", () => {
  assert.doesNotMatch(productionSmoke, /\[401, 403, 40[45]\]/);
  assert.match(
    productionSmoke,
    /health\.checks\?\.database\?\.status\)\.toBe\("ok"\)/,
  );
  assert.match(
    productionSmoke,
    /health\.checks\?\.env\?\.status\)\.toBe\("ok"\)/,
  );
  assert.match(
    smokeWorkflow,
    /EXPECTED_DEPLOYMENT_SHA: \$\{\{ github\.sha \}\}/,
  );
  assert.match(smokeWorkflow, /needs: provenance/);
  assert.match(smokeWorkflow, /environment:\s*\n\s+name: production/);
  assert.doesNotMatch(smokeWorkflow, /SMOKE_TEST_BOT_BYPASS_SECRET|x-smoke-test-token/);
  assert.doesNotMatch(playwrightConfig, /extraHTTPHeaders|SMOKE_TEST_BOT_BYPASS_SECRET|x-smoke-test-token/);
  assert.match(productionSmoke, /maxRedirects:\s*0/);
  assert.match(productionSmoke, /expect\(response\.url\(\)\)\.toBe\(target\.toString\(\)\)/);
  assert.match(productionSmoke, /expect\(parsed\.origin\)\.toBe\(expectedOrigin\)/);
  assert.match(productionSmoke, /expect\(parsed\.pathname\)\.toBe\(expectedPath\)/);
  assert.match(productionSmoke, /expect\(parsed\.search\)\.toBe\(""\)/);
  assert.match(productionSmoke, /expect\(parsed\.hash\)\.toBe\(""\)/);
  const smokeRunner = readFileSync(new URL("../../run-smoke.mjs", import.meta.url), "utf8");
  assert.match(smokeRunner, /redirect: "manual"/);
  // The intent is that the runner compares the RESPONSE url against THE URL IT
  // ASKED FOR, so a redirect cannot satisfy the probe.
  //
  // This assertion was previously `\w*[Uu]rl\.toString\(\)`, which is
  // rename-proof but also satisfied by comparing against the WRONG url -- it
  // asserts only that *some* variable ending in "url" was used. Loosening a
  // guard so a rename cannot break it removes the thing the guard was for.
  // Raised by independent review; the earlier justification was wrong.
  //
  // Rename-proof AND specific: read the variable the request URL was built
  // into, then require the comparison to use THAT name.
  const urlBinding = /const (\w+) = new URL\(\s*"\/api\/health\/migrations"/.exec(
    smokeRunner,
  );
  assert.ok(
    urlBinding,
    "run-smoke.mjs no longer builds the migration-health URL into a named const; " +
      "the response-URL comparison below cannot be bound to it.",
  );
  const urlName = urlBinding[1];
  assert.match(
    smokeRunner,
    new RegExp(`response\\.url !== ${urlName}\\.toString\\(\\)`),
    `run-smoke.mjs must compare response.url against ${urlName} -- the URL it ` +
      "actually requested -- not against some other url-shaped variable.",
  );
  assert.match(
    smokeWorkflow,
    /node scripts\/run-smoke\.mjs[\s\S]*https:\/\/restoreassist\.app/,
  );
  assert.doesNotMatch(smokeWorkflow, /github\.event\.inputs\.base_url/);
});

test("provider build and start commands cannot mutate migration state", () => {
  const build = readFileSync(new URL("../../build.sh", import.meta.url), "utf8");
  const start = readFileSync(new URL("../../start-production.sh", import.meta.url), "utf8");
  for (const source of [build, start]) {
    assert.doesNotMatch(source, /prisma\s+migrate\s+(?:deploy|resolve)/);
    assert.doesNotMatch(source, /--(?:applied|rolled-back)/);
  }
});
