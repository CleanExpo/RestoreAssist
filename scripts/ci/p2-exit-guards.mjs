import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/check-gst-callers.mjs"]);
run("node", ["scripts/ci/check-p2-hardcoded-rates.mjs"]);
run("npm", [
  "run",
  "test:unit",
  "--",
  "lib/moisture/__tests__/latest-monitoring-readings.test.ts",
  "lib/reports/__tests__/pdf-moisture-readings.test.ts",
  "lib/estimate/__tests__/approval-snapshot.test.ts",
  "lib/compliance/__tests__/s500-intake-gate.test.ts",
  "lib/compliance/__tests__/disposal-authority-gate.test.ts",
]);

console.log("P2 exit guards passed (automated slice).");
