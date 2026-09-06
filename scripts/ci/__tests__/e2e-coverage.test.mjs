import assert from "node:assert/strict";
import test from "node:test";

import {
  findCoverageDrift,
  parseCoverageManifest,
  hasSmokeTitle,
  mentionsSpec,
  stripComments,
  summarise,
} from "../e2e-coverage.mjs";

test("parses a manifest into spec -> disposition", () => {
  const parsed = parseCoverageManifest(
    ["# a comment", "", "billing.spec.ts   unrun:no CI harness boots the app", "auth.spec.ts   a1"].join(
      "\n",
    ),
  );
  assert.equal(parsed.get("auth.spec.ts"), "a1");
  assert.match(parsed.get("billing.spec.ts"), /no CI harness/);
});

test("a manifest entry without a disposition is rejected", () => {
  assert.throws(() => parseCoverageManifest("auth.spec.ts"), /disposition/);
});

test("a spec on disk that the manifest does not name is drift", () => {
  const drift = findCoverageDrift({
    onDisk: ["auth.spec.ts", "new-thing.spec.ts"],
    manifest: new Map([["auth.spec.ts", "a1"]]),
    smokeTagged: [],
    a1Declared: ["auth.spec.ts"],
    workflowNamed: new Map(),
  });
  assert.deepEqual(drift.unmentioned, ["new-thing.spec.ts"]);
});

test("a manifest entry whose spec is gone is drift", () => {
  const drift = findCoverageDrift({
    onDisk: [],
    manifest: new Map([["deleted.spec.ts", "unrun:reason"]]),
    smokeTagged: [],
    a1Declared: [],
    workflowNamed: new Map(),
  });
  assert.deepEqual(drift.missing, ["deleted.spec.ts"]);
});

test("claiming @smoke coverage the file does not carry is drift", () => {
  // THE POINT OF THIS GATE. A manifest that only records intentions would let
  // a spec be marked covered while nothing runs it. Every claim is checked
  // against the mechanism that would have to be true for it to hold.
  const drift = findCoverageDrift({
    onDisk: ["liar.spec.ts"],
    manifest: new Map([["liar.spec.ts", "smoke"]]),
    smokeTagged: [],
    a1Declared: [],
    workflowNamed: new Map(),
  });
  assert.equal(drift.falseClaims.length, 1);
  assert.match(drift.falseClaims[0], /liar\.spec\.ts/);
  assert.match(drift.falseClaims[0], /@smoke/);
});

test("a real @smoke claim is accepted", () => {
  const drift = findCoverageDrift({
    onDisk: ["real.spec.ts"],
    manifest: new Map([["real.spec.ts", "smoke"]]),
    smokeTagged: ["real.spec.ts"],
    a1Declared: [],
    workflowNamed: new Map(),
  });
  assert.deepEqual(drift.falseClaims, []);
});

test("claiming A1 coverage the producer does not declare is drift", () => {
  const drift = findCoverageDrift({
    onDisk: ["ghost.spec.ts"],
    manifest: new Map([["ghost.spec.ts", "a1"]]),
    smokeTagged: [],
    a1Declared: ["other.spec.ts"],
    workflowNamed: new Map(),
  });
  assert.equal(drift.falseClaims.length, 1);
  assert.match(drift.falseClaims[0], /A1/);
});

test("claiming a workflow runs it, when that workflow never names it, is drift", () => {
  const drift = findCoverageDrift({
    onDisk: ["x.spec.ts"],
    manifest: new Map([["x.spec.ts", "workflow:sketch-e2e.yml"]]),
    smokeTagged: [],
    a1Declared: [],
    workflowNamed: new Map([["sketch-e2e.yml", ["other.spec.ts"]]]),
  });
  assert.equal(drift.falseClaims.length, 1);
  assert.match(drift.falseClaims[0], /sketch-e2e\.yml/);
});

test("an unrun declaration must carry a reason", () => {
  const drift = findCoverageDrift({
    onDisk: ["x.spec.ts"],
    manifest: new Map([["x.spec.ts", "unrun:"]]),
    smokeTagged: [],
    a1Declared: [],
    workflowNamed: new Map(),
  });
  assert.equal(drift.falseClaims.length, 1);
  assert.match(drift.falseClaims[0], /reason/i);
});

test("summarise counts what actually runs, not what is claimed", () => {
  const s = summarise(
    new Map([
      ["a.spec.ts", "smoke"],
      ["b.spec.ts", "a1"],
      ["c.spec.ts", "unrun:needs a booted app"],
      ["d.spec.ts", "unrun:needs a booted app"],
    ]),
  );
  assert.equal(s.executed, 2);
  assert.equal(s.unrun, 2);
  assert.equal(s.total, 4);
});

// Independent review (independent cross-vendor review, 2026-09-07) — P1.
// A disposition that is not one of the known kinds escaped every verification
// branch in findCoverageDrift AND was counted as executed by summarise. So a
// typo was the one way to claim coverage that nothing ever checked.
test("a manifest disposition that is not a known kind is rejected", () => {
  assert.throws(
    () => parseCoverageManifest("auth.spec.ts   smok"),
    /unknown disposition/i,
  );
  assert.throws(
    () => parseCoverageManifest("auth.spec.ts   unrun"),
    /unknown disposition/i,
  );
  assert.throws(
    () => parseCoverageManifest("auth.spec.ts   workflow"),
    /unknown disposition/i,
  );
});

test("every known disposition kind is still accepted", () => {
  const parsed = parseCoverageManifest(
    [
      "a.spec.ts   smoke",
      "b.spec.ts   a1",
      "c.spec.ts   workflow:sketch-e2e.yml",
      "d.spec.ts   unrun:nothing boots the app",
    ].join("\n"),
  );
  assert.equal(parsed.size, 4);
});

// Independent review — P1. Coverage was decided by a raw substring search, so
// `@smoke` in a comment, or a spec filename mentioned in a YAML comment, both
// counted as "this spec is executed". Playwright's grep and the workflow runner
// see neither.
test("a tag or filename that appears only in a comment does not count", () => {
  assert.equal(stripComments("// @smoke\nconst x = 1;\n", "ts").includes("@smoke"), false);
  assert.equal(stripComments("/* @smoke */\nconst x = 1;\n", "ts").includes("@smoke"), false);
  assert.equal(stripComments("# runs billing.spec.ts one day\njobs:\n", "yml").includes("billing.spec.ts"), false);
});

test("a tag or filename outside a comment still counts", () => {
  assert.equal(stripComments("test('x @smoke', () => {});\n", "ts").includes("@smoke"), true);
  assert.equal(stripComments("run: npx playwright test billing.spec.ts\n", "yml").includes("billing.spec.ts"), true);
});

// Independent review, round 3 — P1. Coverage was decided by a bare substring
// search, so one spec's basename appearing INSIDE another's counted as a
// mention. Two such pairs exist in this repository today:
//   auth.spec.ts   is a substring of  invite-tech-google-oauth.spec.ts
//   health.spec.ts is a substring of  crm-health.spec.ts
// A workflow naming only the longer one silently satisfied the shorter one's
// coverage claim, and the shorter spec stayed unexecuted.
test("one spec's name inside another's does not count as a mention", () => {
  assert.equal(mentionsSpec("run: playwright test invite-tech-google-oauth.spec.ts", "auth.spec.ts"), false);
  assert.equal(mentionsSpec("run: playwright test crm-health.spec.ts", "health.spec.ts"), false);
});

test("a genuine mention still counts, path-qualified or not", () => {
  assert.equal(mentionsSpec("run: playwright test auth.spec.ts", "auth.spec.ts"), true);
  assert.equal(mentionsSpec("run: playwright test docs/archive/playwright-e2e/auth.spec.ts", "auth.spec.ts"), true);
  assert.equal(mentionsSpec("run: playwright test billing/auth.spec.ts --project=chromium", "auth.spec.ts"), true);
  assert.equal(mentionsSpec('run: npx playwright test "auth.spec.ts"', "auth.spec.ts"), true);
});

// Independent review, round 3 — P1. Playwright's grep matches TEST TITLES. A
// `@smoke` anywhere else in the file -- a string literal, a run instruction --
// selects nothing, so counting it as smoke coverage claims a spec runs when it
// does not. Comments were already excluded; this closes the rest.
test("@smoke only counts when it is in a test or describe title", () => {
  assert.equal(hasSmokeTitle('test.describe("@smoke pilot workflow", () => {});'), true);
  assert.equal(hasSmokeTitle('test("@smoke does a thing", async () => {});'), true);
  assert.equal(hasSmokeTitle("test.describe('@smoke single quoted', () => {});"), true);
  // not a title
  assert.equal(hasSmokeTitle('console.log("@smoke");'), false);
  assert.equal(hasSmokeTitle('const tag = "@smoke";'), false);
  assert.equal(hasSmokeTitle('// Run: pnpm test:smoke (any subset matching @smoke)'), false);
});
