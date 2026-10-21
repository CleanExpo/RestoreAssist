#!/usr/bin/env node
/**
 * JEV verdict. Reads out/<FAMILY>.jsonl for every family in families.json (or
 * each --family given), writes out/summary.json, exits non-zero on any run
 * failure.
 *
 * A family fails the run when its out file is missing or empty, a row is
 * malformed or duplicated, it has fewer than 3 controls, any control is not
 * FAIL (BROKEN_CHECK: a planted defect went undetected), or the case count is
 * below its expected_cases floor. A hard-gate family also fails on any FAIL
 * or INCONCLUSIVE case. Non-hard-gate reds are RED_ADVISORY.
 *
 *   node aggregate.mjs [--family J1 ...]   verdict
 *   node aggregate.mjs --control           planted self-test of this verdict
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATES = new Set(["PASS", "FAIL", "KNOWN_GAP", "INCONCLUSIVE"]);
const AREAS = new Set(["flow", "photos", "floorplans", "crm", "payments", "security", "domain"]);

export function judge(familyTable, outDir, only) {
  const run_failures = [];
  const families = {};
  const areas = {};
  const scope = only.length ? only : Object.keys(familyTable);
  for (const f of scope) {
    const spec = familyTable[f];
    if (!spec) {
      run_failures.push(`${f}: not in families.json`);
      continue;
    }
    const file = path.join(outDir, `${f}.jsonl`);
    if (!fs.existsSync(file)) {
      run_failures.push(`${f}: no results file`);
      continue;
    }
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const seen = new Set();
    const v = { name: spec.name, hard_gate: !!spec.hard_gate, cases: 0, controls: 0, controls_caught: 0, PASS: 0, FAIL: 0, KNOWN_GAP: 0, INCONCLUSIVE: 0, broken_checks: [] };
    lines.forEach((line, i) => {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        run_failures.push(`${f}: line ${i + 1} is not JSON`);
        return;
      }
      const bad =
        typeof r.id !== "string" || r.family !== f || !["case", "control"].includes(r.kind) || !STATES.has(r.state) || !AREAS.has(r.area) || (r.state === "KNOWN_GAP" && !r.gap_id);
      if (bad) {
        run_failures.push(`${f}: malformed row ${i + 1} (${String(r.id).slice(0, 80)})`);
        return;
      }
      if (seen.has(r.id)) {
        run_failures.push(`${f}: duplicate id ${r.id.slice(0, 80)}`);
        return;
      }
      seen.add(r.id);
      if (r.kind === "control") {
        v.controls++;
        if (r.state === "FAIL") v.controls_caught++;
        else v.broken_checks.push(r.id);
        return;
      }
      v.cases++;
      v[r.state]++;
      const a = (areas[r.area] ??= { PASS: 0, FAIL: 0, KNOWN_GAP: 0, INCONCLUSIVE: 0 });
      a[r.state]++;
    });
    if (lines.length === 0) run_failures.push(`${f}: results file is empty`);
    if (v.controls < 3) run_failures.push(`${f}: only ${v.controls} controls (need 3)`);
    if (v.broken_checks.length) run_failures.push(`${f}: BROKEN_CHECK ${v.broken_checks.join(", ")}`);
    if (v.cases < (spec.expected_cases ?? 0)) run_failures.push(`${f}: ${v.cases} cases, floor is ${spec.expected_cases}`);
    if (v.hard_gate && (v.FAIL || v.INCONCLUSIVE)) run_failures.push(`${f}: hard gate has ${v.FAIL} FAIL, ${v.INCONCLUSIVE} INCONCLUSIVE`);
    v.verdict = v.broken_checks.length ? "BROKEN_CHECK" : v.FAIL ? (v.hard_gate ? "FAIL" : "RED_ADVISORY") : "PASS";
    families[f] = v;
  }
  return { run_failures, families, areas };
}

function head() {
  try {
    return execFileSync("git", ["-C", JEV, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function control() {
  // Each planted table must produce the named run failure; a clean table must produce none.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jev-agg-"));
  const table = { X: { name: "x", expected_cases: 2, hard_gate: false }, H: { name: "h", expected_cases: 1, hard_gate: true } };
  const row = (f, id, kind, state, extra = {}) => JSON.stringify({ id, family: f, kind, state, area: "security", ...extra });
  const ctrls = (f) => [row(f, `${f}-c1`, "control", "FAIL"), row(f, `${f}-c2`, "control", "FAIL"), row(f, `${f}-c3`, "control", "FAIL")];
  const write = (f, rows) => fs.writeFileSync(path.join(dir, `${f}.jsonl`), rows.join("\n") + "\n");
  const cleanX = [...ctrls("X"), row("X", "X-1", "case", "PASS"), row("X", "X-2", "case", "FAIL")];
  const cleanH = [...ctrls("H"), row("H", "H-1", "case", "PASS")];
  const plants = [
    ["clean tables pass", () => {}, null],
    ["missing family file", () => fs.unlinkSync(path.join(dir, "X.jsonl")), "X: no results file"],
    ["too few controls", () => write("X", cleanX.slice(1)), "X: only 2 controls"],
    ["uncaught control", () => write("X", [...cleanX.slice(1), row("X", "X-c1", "control", "PASS")]), "BROKEN_CHECK X-c1"],
    ["malformed row", () => write("X", [...cleanX, '{"id":"X-3","family":"X","kind":"case","state":"MAYBE","area":"security"}']), "malformed row"],
    ["known gap without gap_id", () => write("X", [...cleanX, row("X", "X-3", "case", "KNOWN_GAP")]), "malformed row"],
    ["duplicate id", () => write("X", [...cleanX, row("X", "X-1", "case", "PASS")]), "duplicate id X-1"],
    ["case floor", () => write("X", cleanX.slice(0, 4)), "floor is 2"],
    ["hard-gate FAIL", () => write("H", [...cleanH, row("H", "H-2", "case", "FAIL")]), "hard gate has 1 FAIL"],
    ["hard-gate INCONCLUSIVE", () => write("H", [...cleanH, row("H", "H-2", "case", "INCONCLUSIVE")]), "0 FAIL, 1 INCONCLUSIVE"],
    ["empty file", () => fs.writeFileSync(path.join(dir, "X.jsonl"), ""), "X: results file is empty"],
  ];
  let bad = 0;
  for (const [name, plant, expect] of plants) {
    write("X", cleanX);
    write("H", cleanH);
    plant();
    const { run_failures } = judge(table, dir, []);
    const ok = expect === null ? run_failures.length === 0 : run_failures.some((m) => m.includes(expect));
    console.log(`${ok ? "caught" : "MISSED"}  ${name}${ok ? "" : `  got: ${JSON.stringify(run_failures)}`}`);
    if (!ok) bad++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (bad) {
    console.log(`CONTROL BROKEN: ${bad} planted defect(s) not detected`);
    process.exit(1);
  }
  console.log("CONTROL OK");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--control")) return control();
  const only = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--family") only.push(argv[++i]);
  const table = JSON.parse(fs.readFileSync(path.join(JEV, "families.json"), "utf8")).families;
  const outDir = path.join(JEV, "out");
  const res = judge(table, outDir, only);
  const blocked = fs.existsSync(path.join(outDir, "vitest-exit")) ? fs.readFileSync(path.join(outDir, "vitest-exit"), "utf8").trim() : null;
  if (blocked !== null && blocked !== "0") res.run_failures.push(`vitest exited ${blocked}`);
  const summary = { schema: "jev-summary/1", head: head(), at: new Date().toISOString(), partial: only.length > 0, ...res };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  for (const [f, v] of Object.entries(res.families)) {
    console.log(`${f} ${v.verdict.padEnd(12)} cases=${v.cases} pass=${v.PASS} fail=${v.FAIL} gap=${v.KNOWN_GAP} inconclusive=${v.INCONCLUSIVE} controls=${v.controls_caught}/${v.controls}  ${v.name}`);
  }
  for (const [a, v] of Object.entries(res.areas)) console.log(`area ${a}: ${v.PASS} pass, ${v.FAIL} fail, ${v.KNOWN_GAP} known gap, ${v.INCONCLUSIVE} inconclusive`);
  for (const m of res.run_failures) console.log(`RUN FAILURE: ${m}`);
  process.exit(res.run_failures.length ? 1 : 0);
}

main();
