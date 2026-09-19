#!/usr/bin/env node
// Verifier for the three-persona walkthrough results (results.jsonl).
//
//   node e2e/walkthrough/verify.mjs <results.jsonl>   check a real run
//   node e2e/walkthrough/verify.mjs --self-test       prove the checks can fail
//
// Exit 0 only when every planned step has a result, nothing is UNMEASURED and no
// line is INVALID. A line is INVALID when:
//   - its outcome is not one of OUTCOMES
//   - it claims success (PASS/PURCHASED) without an existing screenshot or with HTTP >= 400
//   - it is a purchase step recorded as plain PASS (must say PURCHASED, SIMULATED or BYPASS)
//   - it sent a non-GET request to a host other than localhost (production must stay untouched)
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAN = JSON.parse(readFileSync(join(HERE, "steps.json"), "utf8"));
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

function belongsTo(stepId, planId) {
  return stepId === planId || stepId.startsWith(`${planId}.`);
}

export function verify(resultsPath) {
  const baseDir = dirname(resolve(resultsPath));
  const lines = readFileSync(resultsPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const records = [];
  const invalid = [];
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
    if (!r.step || !OUTCOMES.has(r.outcome)) {
      invalid.push(`${where}: missing step or unknown outcome "${r.outcome}"`);
      return;
    }
    if (SUCCESS.has(r.outcome)) {
      const shot = r.screenshot && (isAbsolute(r.screenshot) ? r.screenshot : join(baseDir, r.screenshot));
      if (!shot || !existsSync(shot)) invalid.push(`${where}: ${r.outcome} without an existing screenshot`);
      if (typeof r.status === "number" && r.status >= 400) invalid.push(`${where}: ${r.outcome} with HTTP ${r.status}`);
    }
    if (r.outcome === "PASS" && PLAN.purchaseSteps.some((p) => belongsTo(r.step, p))) {
      invalid.push(`${where}: purchase recorded as PASS; must be PURCHASED, SIMULATED or BYPASS`);
    }
    if (r.url && r.method && r.method.toUpperCase() !== "GET") {
      let host;
      try {
        host = new URL(r.url).hostname;
      } catch {
        host = "";
      }
      if (!LOCAL_HOSTS.has(host)) invalid.push(`${where}: ${r.method} to non-local host "${host}"`);
    }
  });

  const missing = PLAN.steps.filter((s) => !records.some((r) => r.step && belongsTo(r.step, s.id))).map((s) => s.id);
  const unmeasured = records.filter((r) => r.outcome === "UNMEASURED").length;
  const counts = {};
  for (const r of records) counts[r.outcome] = (counts[r.outcome] || 0) + 1;

  const summary =
    `STEPS=${PLAN.steps.length} COVERED=${PLAN.steps.length - missing.length} ` +
    `MISSING=${missing.length} UNMEASURED=${unmeasured} INVALID=${invalid.length}`;
  const ok = missing.length === 0 && unmeasured === 0 && invalid.length === 0;
  return { ok, summary, missing, invalid, counts };
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "walkthrough-verify-"));
  const shot = "shot.png";
  writeFileSync(join(dir, shot), "x");
  const valid = PLAN.steps.map((s) => ({
    step: s.id,
    outcome: PLAN.purchaseSteps.includes(s.id) ? "SIMULATED" : "PASS",
    screenshot: shot,
    status: 200,
    url: "http://localhost:3000/",
    method: "GET",
  }));
  const run = (name, recs, expectOk) => {
    const file = join(dir, `${name}.jsonl`);
    writeFileSync(file, recs.map((r) => JSON.stringify(r)).join("\n"));
    const res = verify(file);
    const good = res.ok === expectOk;
    console.log(`${good ? "ok  " : "FAIL"} ${name}: expected ${expectOk ? "accept" : "reject"}, got ${res.ok ? "accept" : "reject"} (${res.summary})`);
    return good;
  };
  const results = [
    run("complete-valid-run", valid, true),
    run("planted-pass-with-missing-screenshot", [...valid.slice(1), { ...valid[0], screenshot: "does-not-exist.png" }], false),
    run("one-step-missing", valid.slice(1), false),
    run("purchase-recorded-as-plain-pass", valid.map((r) => (r.step === "O6" ? { ...r, outcome: "PASS" } : r)), false),
    run("write-to-production", [...valid, { step: "O1.9", outcome: "FAIL", url: "https://restoreassist.app/api/x", method: "POST" }], false),
    run("unmeasured-step", valid.map((r) => (r.step === "T12" ? { ...r, outcome: "UNMEASURED" } : r)), false),
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
