#!/usr/bin/env node
// Verifier for the three-persona walkthrough results (results.jsonl).
//
//   node e2e/walkthrough/verify.mjs <results.jsonl>   check a real run
//   node e2e/walkthrough/verify.mjs --self-test       prove the checks can fail
//
// Exit 0 only when every approved step has a result from ONE run, nothing is
// UNMEASURED and no line is INVALID.
//
// WHAT THIS FILE TRUSTS, and what it deliberately does not. An independent review
// (report review-9cb5d882a.json) showed ten ways a fabricated or incomplete run
// still exited 0. Every one of them came from trusting something a run can edit:
//
//   - the plan file. steps.json defined both the required coverage AND the purchase
//     classification, so deleting a step or clearing purchaseSteps silently weakened
//     the contract. The approved step ids and purchase subset are now CONSTANTS in
//     this file, and steps.json is digest-checked against PLAN_SHA256. Editing the
//     plan is therefore a reviewable change to this file, in the same commit.
//   - the step id. Prefix matching let any child id ("O6.only-one-addon") satisfy its
//     whole parent. Ids must now match the approved contract exactly.
//   - evidence. Only PASS/PURCHASED needed any, so 39 bare EXPECTED-BY-CODE records
//     passed. Every outcome now carries outcome-specific evidence, and a step that
//     could not be exercised is UNMEASURED, never FAIL.
//   - the results file. It was appended to across runs with no run identity, so an
//     incomplete rerun borrowed coverage from an older one. Every record carries a
//     runId and all records must share it.
//   - one optional request pair. The production-write check read only r.url/r.method,
//     so an external POST recorded in badResponses escaped. EVERY recorded
//     destination is now checked.
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, isAbsolute, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAN_PATH = join(HERE, "steps.json");

// The approved evidence contract. Held here, not in steps.json, so that altering the
// plan cannot alter what a run must prove. Change these and the plan together.
const PLAN_SHA256 = "3686f3d1b406049f47a1554b0b720cf8e9681c804766cb08ebc6913ce4233eee";
const APPROVED_STEP_IDS = [
  "O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9", "O10", "O11", "O12", "O13", "O14",
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14",
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
];
const APPROVED_PURCHASE_STEPS = new Set(["O5", "O6", "O7", "O8"]);

const OUTCOMES = new Set([
  "PASS",
  "FAIL",
  "EXPECTED-BY-CODE",
  "PURCHASED",
  "SIMULATED",
  "BYPASS",
  "UNMEASURED",
]);
const SUCCESS = new Set(["PASS", "PURCHASED"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GAP_ID = /^G\d+$/;

const isText = (v) => typeof v === "string" && v.trim() !== "";

/** Every destination this record proves the run reached, not just the summary pair. */
function destinationsOf(r) {
  const out = [];
  if (isText(r.url)) out.push({ url: r.url, method: isText(r.method) ? r.method : "GET" });
  for (const key of ["badResponses", "requests"]) {
    const list = Array.isArray(r[key]) ? r[key] : [];
    for (const d of list) {
      if (d && isText(d.url)) out.push({ url: d.url, method: isText(d.method) ? d.method : "GET" });
    }
  }
  return out;
}

/** null when the screenshot is real evidence belonging to this run, else the reason it is not. */
function screenshotProblem(rel, baseDir, runId) {
  if (!isText(rel)) return "no screenshot";
  if (isAbsolute(rel)) return "screenshot must be relative to the results file";
  const abs = resolve(baseDir, rel);
  if (abs !== resolve(baseDir) && !abs.startsWith(resolve(baseDir) + sep)) {
    return "screenshot escapes the run directory";
  }
  if (!rel.split(sep).join("/").startsWith(`shots/${runId}/`)) {
    return `screenshot is not under shots/${runId}/`;
  }
  if (!existsSync(abs)) return "screenshot does not exist";
  let head;
  try {
    head = readFileSync(abs).subarray(0, 8);
  } catch {
    return "screenshot is unreadable";
  }
  if (!head.equals(PNG_MAGIC)) return "screenshot is not a PNG";
  return null;
}

export function verify(resultsPath, plan) {
  const baseDir = dirname(resolve(resultsPath));
  const invalid = [];

  // The plan may only describe the approved steps; it may never redefine them.
  if (!plan) {
    const raw = readFileSync(PLAN_PATH);
    const digest = createHash("sha256").update(raw).digest("hex");
    if (digest !== PLAN_SHA256) {
      invalid.push(`plan: steps.json digest ${digest} does not match the approved ${PLAN_SHA256}`);
    }
    plan = JSON.parse(raw.toString("utf8"));
  }
  const planIds = Array.isArray(plan.steps) ? plan.steps.map((s) => s && s.id) : [];
  if (planIds.length !== APPROVED_STEP_IDS.length || planIds.some((id, i) => id !== APPROVED_STEP_IDS[i])) {
    invalid.push(`plan: step ids do not match the approved contract (${APPROVED_STEP_IDS.length} steps)`);
  }

  const lines = readFileSync(resultsPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const records = [];
  lines.forEach((raw, i) => {
    let r;
    try {
      r = JSON.parse(raw);
    } catch {
      invalid.push(`line ${i + 1}: not JSON`);
      return;
    }
    records.push(r);
    const where = `line ${i + 1} (${r.step})`;
    if (!isText(r.step) || !OUTCOMES.has(r.outcome)) {
      invalid.push(`${where}: missing step or unknown outcome "${r.outcome}"`);
      return;
    }
    if (!APPROVED_STEP_IDS.includes(r.step)) {
      invalid.push(`${where}: "${r.step}" is not an approved step id`);
      return;
    }
    if (!isText(r.runId)) {
      invalid.push(`${where}: no runId, so this record cannot be tied to a run`);
    }
    // Every record says what was observed. Without this, 39 bare records passed.
    if (!isText(r.note)) invalid.push(`${where}: ${r.outcome} without a note saying what was observed`);
    if (r.status !== undefined && r.status !== null && typeof r.status !== "number") {
      invalid.push(`${where}: status ${JSON.stringify(r.status)} is not a number`);
    }

    const shotProblem = screenshotProblem(r.screenshot, baseDir, isText(r.runId) ? r.runId : "");
    const hasStatus = typeof r.status === "number";
    const hasResponses = Array.isArray(r.badResponses) && r.badResponses.length > 0;
    const exercised = shotProblem === null || hasStatus || hasResponses;

    if (SUCCESS.has(r.outcome)) {
      if (shotProblem) invalid.push(`${where}: ${r.outcome} - ${shotProblem}`);
      if (hasStatus && r.status >= 400) invalid.push(`${where}: ${r.outcome} with HTTP ${r.status}`);
    } else if (r.outcome === "EXPECTED-BY-CODE") {
      if (!isText(r.gap) || !GAP_ID.test(r.gap)) {
        invalid.push(`${where}: EXPECTED-BY-CODE must name the gap it confirms (G<n>)`);
      }
      if (!exercised) invalid.push(`${where}: EXPECTED-BY-CODE without evidence the step was exercised`);
    } else if (r.outcome === "FAIL") {
      // A measured failure is reportable. A step that could not be run is UNMEASURED.
      if (!exercised) invalid.push(`${where}: FAIL without evidence the step was exercised`);
    } else if (r.outcome === "SIMULATED" || r.outcome === "BYPASS") {
      if (!exercised) invalid.push(`${where}: ${r.outcome} without evidence it was carried out`);
    }

    if (r.outcome === "PASS" && APPROVED_PURCHASE_STEPS.has(r.step)) {
      invalid.push(`${where}: purchase recorded as PASS; must be PURCHASED, SIMULATED or BYPASS`);
    }

    for (const d of destinationsOf(r)) {
      if (d.method.toUpperCase() === "GET") continue;
      let host;
      try {
        host = new URL(d.url).hostname;
      } catch {
        host = "";
      }
      if (!LOCAL_HOSTS.has(host)) invalid.push(`${where}: ${d.method} to non-local host "${host}"`);
    }
  });

  // One results file proves one run. Mixing runs is how an incomplete rerun borrowed
  // coverage from an older, complete one.
  const runIds = [...new Set(records.map((r) => r.runId).filter(isText))];
  if (runIds.length > 1) invalid.push(`results mix ${runIds.length} runs: ${runIds.join(", ")}`);
  const ofRun = runIds.length === 1 ? records.filter((r) => r.runId === runIds[0]) : records;

  const missing = APPROVED_STEP_IDS.filter((id) => !ofRun.some((r) => r.step === id));
  const unmeasured = ofRun.filter((r) => r.outcome === "UNMEASURED").length;
  const counts = {};
  for (const r of ofRun) counts[r.outcome] = (counts[r.outcome] || 0) + 1;

  const summary =
    `STEPS=${APPROVED_STEP_IDS.length} COVERED=${APPROVED_STEP_IDS.length - missing.length} ` +
    `MISSING=${missing.length} UNMEASURED=${unmeasured} INVALID=${invalid.length}`;
  const ok = missing.length === 0 && unmeasured === 0 && invalid.length === 0;
  return { ok, summary, missing, invalid, counts };
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "walkthrough-verify-"));
  const RUN = "run-selftest";
  mkdirSync(join(dir, "shots", RUN), { recursive: true });
  const shotFor = (id) => {
    const rel = join("shots", RUN, `${id}.png`);
    writeFileSync(join(dir, rel), PNG_MAGIC);
    return rel;
  };
  writeFileSync(join(dir, "not-an-image.txt"), "this is not a png");
  const PLAN = JSON.parse(readFileSync(PLAN_PATH, "utf8"));
  const valid = PLAN.steps.map((s) => ({
    step: s.id,
    runId: RUN,
    outcome: APPROVED_PURCHASE_STEPS.has(s.id) ? "SIMULATED" : "PASS",
    note: `walkthrough self-test record for ${s.id}`,
    screenshot: shotFor(s.id),
    status: 200,
    url: "http://localhost:3000/",
    method: "GET",
  }));
  const planPath = join(dir, "plan.json");
  const withPlan = (mutate) => {
    const copy = JSON.parse(JSON.stringify(PLAN));
    mutate(copy);
    writeFileSync(planPath, JSON.stringify(copy));
    return copy;
  };
  const run = (name, recs, expectOk, plan) => {
    const file = join(dir, `${name}.jsonl`);
    writeFileSync(file, recs.map((r) => JSON.stringify(r)).join("\n"));
    const res = plan ? verify(file, plan) : verify(file);
    const good = res.ok === expectOk;
    console.log(`${good ? "ok  " : "FAIL"} ${name}: expected ${expectOk ? "accept" : "reject"}, got ${res.ok ? "accept" : "reject"} (${res.summary})`);
    return good;
  };
  const results = [
    run("complete-valid-run", valid, true),
    run("planted-pass-with-missing-screenshot", [...valid.slice(1), { ...valid[0], screenshot: "does-not-exist.png" }], false),
    run("one-step-missing", valid.slice(1), false),
    run("purchase-recorded-as-plain-pass", valid.map((r) => (r.step === "O6" ? { ...r, outcome: "PASS" } : r)), false),
    run("write-to-production", [...valid, { step: "O1", runId: RUN, outcome: "FAIL", note: "planted", url: "https://restoreassist.app/api/x", method: "POST" }], false),
    run("unmeasured-step", valid.map((r) => (r.step === "T12" ? { ...r, outcome: "UNMEASURED" } : r)), false),
    // --- cases added for review findings 1-6 (report review-9cb5d882a.json) ---
    // F2: evidence was optional for every outcome except PASS/PURCHASED.
    run(
      "bare-expected-by-code-for-every-step",
      PLAN.steps.map((s) => ({ step: s.id, runId: RUN, outcome: "EXPECTED-BY-CODE" })),
      false,
    ),
    run(
      "unmeasured-disguised-as-fail",
      valid.map((r) => (r.step === "T12" ? { step: "T12", runId: RUN, outcome: "FAIL" } : r)),
      false,
    ),
    run(
      "success-status-as-string",
      valid.map((r) => (r.step === "O1" ? { ...r, status: "500" } : r)),
      false,
    ),
    run(
      "screenshot-is-not-an-image",
      valid.map((r) => (r.step === "O1" ? { ...r, screenshot: "not-an-image.txt" } : r)),
      false,
    ),
    // F3: the destination check read only the optional summary request.
    run(
      "external-write-hidden-in-badresponses",
      valid.map((r) =>
        r.step === "O1"
          ? { ...r, url: undefined, method: undefined, badResponses: [{ status: 502, method: "POST", url: "https://restoreassist.app/api/x" }] }
          : r,
      ),
      false,
    ),
    // F4: results carried no run identity, so an older run supplied missing coverage.
    run(
      "stale-run-supplies-missing-coverage",
      [{ ...valid[0], runId: "run-previous" }, ...valid.slice(1).map((r) => ({ ...r, runId: "run-current" }))],
      false,
    ),
    // F5: any child id satisfied its whole parent step.
    run(
      "arbitrary-child-id-replaces-parent",
      valid.map((r) => (r.step === "O6" ? { ...r, step: "O6.only-one-addon" } : r)),
      false,
    ),
    // F6: steps.json was trusted, so editing it weakened the contract.
    run("tampered-plan-drops-a-step", valid.slice(1), false, withPlan((p) => {
      p.steps = p.steps.filter((s) => s.id !== APPROVED_STEP_IDS[0]);
    })),
    run(
      "tampered-plan-clears-purchase-steps",
      valid.map((r) => (r.step === "O6" ? { ...r, outcome: "PASS" } : r)),
      false,
      withPlan((p) => {
        p.purchaseSteps = [];
      }),
    ),
  ];
  rmSync(dir, { recursive: true, force: true });
  const allGood = results.every(Boolean);
  console.log(allGood ? "SELF-TEST PASSED: every planted defect was rejected" : "SELF-TEST FAILED");
  return allGood;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === "--self-test") process.exit(selfTest() ? 0 : 1);
  if (!arg) {
    console.error("usage: verify.mjs <results.jsonl> | --self-test");
    process.exit(2);
  }
  const res = verify(arg);
  console.log(res.summary);
  console.log(`OUTCOMES ${JSON.stringify(res.counts)}`);
  if (res.missing.length) console.log(`MISSING_STEPS ${res.missing.join(" ")}`);
  for (const line of res.invalid) console.log(`INVALID ${line}`);
  process.exit(res.ok ? 0 : 1);
}
