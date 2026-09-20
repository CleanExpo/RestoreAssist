#!/usr/bin/env node
// Verifier for one walkthrough run's results (runs/<runId>/results.jsonl).
//
//   node e2e/walkthrough/verify.mjs <results.jsonl>   check a real run
//   node e2e/walkthrough/verify.mjs --self-test       prove the checks can fail
//
// Exit 0 only when every approved step has a result from ONE run, nothing is
// UNMEASURED and no line is INVALID.
//
// WHAT THIS FILE TRUSTS, and what it deliberately does not. Two independent review
// rounds (reports review-9cb5d882a.json and review-cd837da9f.json) found inputs that
// produced exit 0 from a fabricated or incomplete run. Every one came from trusting
// something a run can edit, or from accepting a claim of evidence without inspecting it:
//
//   - the plan file. steps.json defined both the required coverage AND the purchase
//     classification, so deleting a step or clearing purchaseSteps weakened the
//     contract. The approved ids and purchase subset are CONSTANTS here, and steps.json
//     is digest-checked. Editing the plan is a reviewable change to this file.
//   - the step id. Prefix matching let any child id satisfy its whole parent.
//   - the claim of evidence. Any numeric status counted as proof the step ran, so the
//     no-response sentinel 0 passed, and `badResponses: [{}]` or `[null]` passed. An
//     HTTP observation must now be a real status in 100-599, and a recorded response or
//     request must carry a usable status, method and URL.
//   - the screenshot path. It was string-matched, so `shots/current/../old/old.png`
//     satisfied the prefix while resolving elsewhere. The RESOLVED path must sit inside
//     this run's shots directory, and its name must be the step's own.
//   - the results file. It was shared across runs, so an interrupted rerun borrowed an
//     older complete run's coverage. Each invocation now owns runs/<runId>/, and every
//     record in a file must carry the same runId.
//   - one optional request pair. An external POST recorded in badResponses escaped the
//     production-write check. EVERY recorded destination is checked.
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve, isAbsolute, sep } from "node:path";
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
/** A status a server actually returned. 0 is the harness's "no response" sentinel. */
const isHttpStatus = (v) => Number.isInteger(v) && v >= 100 && v <= 599;
const shotName = (stepId) => `${String(stepId).replace(/[^\w.-]/g, "_")}.png`;

/** Recorded responses and requests only count when they carry a usable observation. */
const usableResponses = (r) =>
  (Array.isArray(r.badResponses) ? r.badResponses : []).filter(
    (d) => d && typeof d === "object" && isHttpStatus(d.status) && isText(d.url),
  );
const usableRequests = (r) =>
  (Array.isArray(r.requests) ? r.requests : []).filter((d) => d && typeof d === "object" && isText(d.url));

/** Every destination this record proves the run reached, not just the summary pair. */
function destinationsOf(r) {
  const out = [];
  if (isText(r.url)) out.push({ url: r.url, method: isText(r.method) ? r.method : "GET" });
  for (const d of [...usableResponses(r), ...usableRequests(r)]) {
    out.push({ url: d.url, method: isText(d.method) ? d.method : "GET" });
  }
  return out;
}

/**
 * null when the screenshot is this step's own evidence inside this run, else the reason
 * it is not. The path is RESOLVED before it is judged: a string prefix check passed
 * `shots/current/../old/old.png`, which resolves into a different run's directory.
 */
function screenshotProblem(rel, baseDir, stepId) {
  if (!isText(rel)) return "no screenshot";
  if (isAbsolute(rel)) return "screenshot must be relative to the results file";
  const shotsDir = resolve(baseDir, "shots");
  const abs = resolve(baseDir, rel);
  if (!abs.startsWith(shotsDir + sep)) return "screenshot is not inside this run's shots directory";
  if (basename(abs) !== shotName(stepId)) return `screenshot is ${basename(abs)}, not this step's ${shotName(stepId)}`;
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
    if (r.status !== undefined && r.status !== null && !isHttpStatus(r.status)) {
      invalid.push(`${where}: status ${JSON.stringify(r.status)} is not an HTTP status the server returned`);
    }

    const shotProblem = screenshotProblem(r.screenshot, baseDir, r.step);
    // Evidence must be inspected, not merely present. Each of these was a bypass.
    const exercised =
      shotProblem === null || isHttpStatus(r.status) || usableResponses(r).length > 0 || usableRequests(r).length > 0;

    if (SUCCESS.has(r.outcome)) {
      if (shotProblem) invalid.push(`${where}: ${r.outcome} - ${shotProblem}`);
      if (isHttpStatus(r.status) && r.status >= 400) invalid.push(`${where}: ${r.outcome} with HTTP ${r.status}`);
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
  mkdirSync(join(dir, "shots"), { recursive: true });
  // A PNG that belongs to a DIFFERENT run, reachable only by traversal.
  mkdirSync(join(dir, "elsewhere"), { recursive: true });
  writeFileSync(join(dir, "elsewhere", shotName("O1")), PNG_MAGIC);
  const shotFor = (id) => {
    const rel = join("shots", shotName(id));
    writeFileSync(join(dir, rel), PNG_MAGIC);
    return rel;
  };
  writeFileSync(join(dir, "shots", "not-an-image.png"), "this is not a png");
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
  const bare = (extra) => PLAN.steps.map((s) => ({ step: s.id, runId: RUN, outcome: "FAIL", note: "claimed", ...extra }));
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
    run("planted-pass-with-missing-screenshot", [...valid.slice(1), { ...valid[0], screenshot: "shots/does-not-exist.png" }], false),
    run("one-step-missing", valid.slice(1), false),
    run("purchase-recorded-as-plain-pass", valid.map((r) => (r.step === "O6" ? { ...r, outcome: "PASS" } : r)), false),
    run("write-to-production", [...valid, { step: "O1", runId: RUN, outcome: "FAIL", note: "planted", url: "https://restoreassist.app/api/x", method: "POST" }], false),
    run("unmeasured-step", valid.map((r) => (r.step === "T12" ? { ...r, outcome: "UNMEASURED" } : r)), false),
    // --- round 1 findings (report review-9cb5d882a.json) ---
    run("bare-expected-by-code-for-every-step", PLAN.steps.map((s) => ({ step: s.id, runId: RUN, outcome: "EXPECTED-BY-CODE" })), false),
    run("unmeasured-disguised-as-fail", valid.map((r) => (r.step === "T12" ? { step: "T12", runId: RUN, outcome: "FAIL" } : r)), false),
    run("success-status-as-string", valid.map((r) => (r.step === "O1" ? { ...r, status: "500" } : r)), false),
    run("screenshot-is-not-an-image", valid.map((r) => (r.step === "O1" ? { ...r, screenshot: "shots/not-an-image.png" } : r)), false),
    run(
      "external-write-hidden-in-badresponses",
      valid.map((r) =>
        r.step === "O1"
          ? { ...r, url: undefined, method: undefined, badResponses: [{ status: 502, method: "POST", url: "https://restoreassist.app/api/x" }] }
          : r,
      ),
      false,
    ),
    run("stale-run-supplies-missing-coverage", [{ ...valid[0], runId: "run-previous" }, ...valid.slice(1).map((r) => ({ ...r, runId: "run-current" }))], false),
    run("arbitrary-child-id-replaces-parent", valid.map((r) => (r.step === "O6" ? { ...r, step: "O6.only-one-addon" } : r)), false),
    run("tampered-plan-drops-a-step", valid.slice(1), false, withPlan((p) => {
      p.steps = p.steps.filter((s) => s.id !== APPROVED_STEP_IDS[0]);
    })),
    run("tampered-plan-clears-purchase-steps", valid.map((r) => (r.step === "O6" ? { ...r, outcome: "PASS" } : r)), false, withPlan((p) => {
      p.purchaseSteps = [];
    })),
    // --- round 2 findings (report review-cd837da9f.json) ---
    // The no-response sentinel and malformed evidence entries each counted as proof.
    run("no-response-sentinel-counts-as-evidence", bare({ status: 0 }), false),
    run("empty-object-badresponse-counts-as-evidence", bare({ badResponses: [{}] }), false),
    run("null-badresponse-counts-as-evidence", bare({ badResponses: [null] }), false),
    run("request-without-url-counts-as-evidence", bare({ requests: [{ method: "POST" }] }), false),
    // Screenshot confinement was a string prefix, so traversal left the run. The path is
    // written literally: path.join() would normalise "shots/.." away and the case would
    // then prove nothing (caught by the mutation control, which stayed silent on it).
    run("screenshot-traversal-out-of-this-run", valid.map((r) => (r.step === "O1" ? { ...r, screenshot: `shots/../elsewhere/${shotName("O1")}` } : r)), false),
    // A screenshot from another step is not this step's evidence.
    run("screenshot-belongs-to-another-step", valid.map((r) => (r.step === "O1" ? { ...r, screenshot: join("shots", shotName("O2")) } : r)), false),
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
