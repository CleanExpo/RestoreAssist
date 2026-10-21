#!/usr/bin/env node
/**
 * npm run jev:det [-- --family J1 [--family J3 ...]]
 *
 * Fresh throwaway Postgres via scripts/ci/test-with-db.sh, the JEV vitest
 * config, then the verdict. Old out/*.jsonl files are removed first so a
 * family that did not run cannot pass on yesterday's rows. Exit code is the
 * verdict's; a non-zero vitest exit is a run failure even when rows exist.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(JEV, "../../..");
const OUT = path.join(JEV, "out");
const argv = process.argv.slice(2);
const only = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--family") only.push(argv[++i]);

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith(".jsonl") || f === "summary.json" || f === "vitest-exit") fs.rmSync(path.join(OUT, f));
}
const files = only.map((f) => `tests/eval/jev/families/${f.toLowerCase()}.jev.test.ts`);
const r = spawnSync("bash", ["scripts/ci/test-with-db.sh", "--reporter=dot", ...files], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, RA_VITEST_CONFIG: "config/vitest.jev.config.js" },
});
fs.writeFileSync(path.join(OUT, "vitest-exit"), String(r.status ?? `signal ${r.signal}`));
const agg = spawnSync("node", [path.join(JEV, "runner/aggregate.mjs"), ...argv], { stdio: "inherit" });
process.exit(agg.status ?? 1);
