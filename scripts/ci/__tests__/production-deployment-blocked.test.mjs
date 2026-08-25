import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = readFileSync(
  new URL("../../../.github/workflows/deploy-production.yml", import.meta.url),
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

test("production workflow fails before receiving credentials or mutating a provider", () => {
  assert.match(workflow, /Production \(BLOCKED\)/);
  assert.match(workflow, /permissions:\s*\{\}/);
  assert.match(workflow, /exit 1/);
  for (const actingMarker of [
    "DIGITALOCEAN_ACCESS_TOKEN",
    "DIGITALOCEAN_APP_ID",
    "secrets.",
    "create-deployment",
    "trigger_digitalocean",
    "/v2/apps/",
    "curl ",
  ]) {
    assert.equal(
      workflow.includes(actingMarker),
      false,
      `blocked workflow must not contain acting marker ${actingMarker}`,
    );
  }
});

test("legacy mutable app source is visibly blocked and cannot auto-deploy", () => {
  assert.match(appSpec, /RELEASE BLOCKER/);
  assert.match(appSpec, /branch: main/);
  assert.match(appSpec, /deploy_on_push: false/);
  assert.match(appSpec, /http_path: \/api\/health/);
});

test("discovers every DigitalOcean component and rejects every mutable runnable source", () => {
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
    assert.equal(
      typeof component.image?.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(component.image.digest),
      false,
      `${kind}:${component.name} unexpectedly looks immutable; this fixture must remain blocked until the path is real`,
    );
  }
});

test("read-only readiness access is main-only, content-bound and always blocked", () => {
  const parsed = parse(parityWorkflow);
  assert.match(parsed.jobs["reject-non-main"].steps[0].run, /exit 1/);
  assert.match(parsed.jobs["evidence-and-block"].steps.at(-1).run, /exit 1/);
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
  assert.match(parityWorkflow, /Refuse deployment until immutable image path exists[\s\S]*exit 1/);
  assert.doesNotMatch(parityWorkflow, /create-deployment|trigger_digitalocean/);
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
  assert.match(smokeRunner, /response\.url !== healthUrl\.toString\(\)/);
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
