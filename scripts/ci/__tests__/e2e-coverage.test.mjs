import assert from "node:assert/strict";
import test from "node:test";

import {
  findCoverageDrift,
  parseCoverageManifest,
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
