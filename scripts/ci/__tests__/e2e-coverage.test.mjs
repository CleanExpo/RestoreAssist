import assert from "node:assert/strict";
import test from "node:test";

import {
  findCoverageDrift,
  parseCoverageManifest,
  hasSmokeTitle,
  mentionsSpec,
  resolveDeclared,
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

const E2E = "docs/archive/playwright-e2e";

test("a genuine mention still counts, path-qualified or not", () => {
  assert.equal(mentionsSpec("run: playwright test auth.spec.ts", "auth.spec.ts", [E2E]), true);
  assert.equal(mentionsSpec(`run: playwright test ${E2E}/auth.spec.ts`, "auth.spec.ts", [E2E]), true);
  assert.equal(mentionsSpec('run: npx playwright test "auth.spec.ts"', "auth.spec.ts", [E2E]), true);
});

// Independent review 2026-09-07 — P1, and the SECOND instance of the class the
// test above was written for. The first fix was still substring matching: it
// permitted `/` before the needle so a path-qualified mention would count, which
// meant a DIFFERENT spec sharing a basename discharged the wrong spec's claim.
//
// This assertion previously read `true` and was WRONG. `billing/auth.spec.ts` is
// not `auth.spec.ts`; a workflow running the former left the latter unexecuted
// while the gate passed. Changing it to `false` makes the gate stricter, never
// weaker -- the failure direction is now a missed mention, which reds the gate,
// instead of a phantom mention, which greened it.
test("a same-basename spec in another directory does not discharge the claim", () => {
  assert.equal(
    mentionsSpec("run: playwright test billing/auth.spec.ts --project=chromium", "auth.spec.ts", [E2E]),
    false,
  );
  assert.equal(
    mentionsSpec("run: playwright test other/cancel-flow.spec.ts", "billing/cancel-flow.spec.ts", [E2E]),
    false,
  );
  // and the spec that IS named still counts, so this is not a blanket refusal
  assert.equal(
    mentionsSpec("run: playwright test other/cancel-flow.spec.ts", "other/cancel-flow.spec.ts", [E2E]),
    true,
  );
});

// Independent review, round 3 — P1. Playwright's grep matches TEST TITLES. A
// `@smoke` anywhere else in the file -- a string literal, a run instruction --
// selects nothing, so counting it as smoke coverage claims a spec runs when it
// does not. Comments were already excluded; this closes the rest.
// Independent review 2026-09-07 — P1. `test.step()` also takes a title string,
// so the modifier chain matched it -- but Playwright's `--grep` does not match
// step titles. A spec whose only `@smoke` sat in a `test.step()` was recorded as
// smoke-covered while `--grep @smoke` selected nothing, Playwright exited 0, and
// the spec went unexecuted behind a green gate.
test("@smoke inside a test.step title does not count as smoke coverage", () => {
  assert.equal(
    hasSmokeTitle('test("plain", async () => { await test.step("inner @smoke", async () => {}); });'),
    false,
  );
  // the same tag in a real title still counts, so the exclusion is narrow
  assert.equal(hasSmokeTitle('test("checkout @smoke", async () => {});'), true);
  // a legitimate modifier chain is untouched
  assert.equal(hasSmokeTitle('test.describe.serial("billing @smoke", () => {});'), true);
});

test("@smoke only counts when it is in a test or describe title", () => {
  assert.equal(hasSmokeTitle('test.describe("@smoke pilot workflow", () => {});'), true);
  assert.equal(hasSmokeTitle('test("@smoke does a thing", async () => {});'), true);
  assert.equal(hasSmokeTitle("test.describe('@smoke single quoted', () => {});"), true);
  // not a title
  assert.equal(hasSmokeTitle('console.log("@smoke");'), false);
  assert.equal(hasSmokeTitle('const tag = "@smoke";'), false);
  assert.equal(hasSmokeTitle('// Run: pnpm test:smoke (any subset matching @smoke)'), false);
});

// Independent review round 2, 2026-09-07 — P1, and the SECOND instance of the
// class round 1's `test.step` finding was supposed to close. The first fix was a
// deny-list excluding `step`, and it still admitted every Playwright hook that
// takes a title `--grep` does not match. A deny-list on this surface needs one
// more spelling forever; the matcher is now an allow-list.
test("a title in a hook --grep never matches does not count as smoke coverage", () => {
  for (const hook of ["step", "beforeEach", "beforeAll", "afterEach", "afterAll"]) {
    assert.equal(
      hasSmokeTitle(`test.${hook}("setup @smoke", async () => {});`),
      false,
      `test.${hook} must not count`,
    );
  }
  // every chain --grep DOES select still counts, so the allow-list is not a blanket refusal
  assert.equal(hasSmokeTitle('test("checkout @smoke", async () => {});'), true);
  assert.equal(hasSmokeTitle('test.only("x @smoke", async () => {});'), true);
  assert.equal(hasSmokeTitle('test.skip("x @smoke", async () => {});'), true);
  assert.equal(hasSmokeTitle('test.describe.serial("b @smoke", () => {});'), true);
  assert.equal(hasSmokeTitle('test.describe.parallel("b @smoke", () => {});'), true);
  assert.equal(hasSmokeTitle('describe("bare @smoke", () => {});'), true);
});

// Independent review round 2, 2026-09-07 — P1. Fixing mentionsSpec and leaving
// its consumer alone fixed nothing: findCoverageDrift had its own
// `named.includes(base(spec))` fallback, which re-opened the exact
// cross-directory collision the matcher had just been rewritten to close.
test("a workflow naming only the root-level spec does not discharge a nested one", () => {
  const onDisk = ["auth.spec.ts", "billing/auth.spec.ts"];
  const workflowNamed = new Map([["ci.yml", ["auth.spec.ts"]]]);

  const drift = findCoverageDrift({
    onDisk,
    manifest: new Map([["billing/auth.spec.ts", "workflow:ci.yml"]]),
    workflowNamed,
    smokeTagged: [],
    a1Declared: [],
  });
  assert.equal(drift.falseClaims.length, 1);

  // the spec that IS named is still accepted, so this is not a blanket refusal
  const ok = findCoverageDrift({
    onDisk,
    manifest: new Map([["auth.spec.ts", "workflow:ci.yml"]]),
    workflowNamed,
    smokeTagged: [],
    a1Declared: [],
  });
  assert.deepEqual(ok.falseClaims, []);
});

// The A1 producer prints bare filenames, so its declarations are resolved
// against the real spec set. An ambiguous bare name resolves to NOTHING rather
// than to whichever spec asked first -- failing closed reds the gate, failing
// open greened it.
test("an ambiguous bare spec name resolves to nothing", () => {
  const ambiguous = ["a/x.spec.ts", "b/x.spec.ts"];
  assert.deepEqual([...resolveDeclared(["x.spec.ts"], ambiguous)], []);
  assert.deepEqual([...resolveDeclared(["a/x.spec.ts"], ambiguous)], ["a/x.spec.ts"]);

  // an exact path match is never ambiguous, even when a basename twin exists
  const mixed = ["auth.spec.ts", "billing/auth.spec.ts"];
  assert.deepEqual([...resolveDeclared(["auth.spec.ts"], mixed)], ["auth.spec.ts"]);
  assert.deepEqual([...resolveDeclared(["billing/auth.spec.ts"], mixed)], ["billing/auth.spec.ts"]);

  assert.deepEqual([...resolveDeclared(["ghost.spec.ts"], mixed)], []);
});
