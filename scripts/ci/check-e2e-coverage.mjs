#!/usr/bin/env node
/**
 * Gate: every end-to-end spec is either executed by a named mechanism, or
 * declared unrun with a reason. See scripts/ci/e2e-coverage.mjs for why.
 *
 *   node scripts/ci/check-e2e-coverage.mjs             # verify
 *   node scripts/ci/check-e2e-coverage.mjs --summary   # verify and print the tally
 *   node scripts/ci/check-e2e-coverage.mjs --self-test # prove the check can fail
 *   node scripts/ci/check-e2e-coverage.mjs --init      # emit a manifest from reality
 *
 * Exit 0 = the manifest matches the disk AND every coverage claim holds.
 * Exit 1 = drift, or a claim that does not hold.
 * Exit 2 = could not run, which is never a pass.
 *
 * Node stdlib plus one `tsx` call for the A1 producer's own spec list, which is
 * deliberately asked rather than duplicated: a second copy of that list here
 * would drift, and the drift would surface as a coverage failure with a
 * misleading cause.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  findCoverageDrift,
  hasSmokeTitle,
  mentionsSpec,
  parseCoverageManifest,
  stripComments,
  summarise,
} from "./e2e-coverage.mjs";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const E2E_ROOT = path.join(repoRoot, "docs", "archive", "playwright-e2e");
const WORKFLOWS = path.join(repoRoot, ".github", "workflows");
const MANIFEST = path.join(repoRoot, "scripts", "ci", "e2e-coverage-manifest.txt");

function discoverSpecs() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".spec.ts")) {
        found.push(path.relative(E2E_ROOT, full).split(path.sep).join("/"));
      }
    }
  };
  walk(E2E_ROOT);
  return found.sort();
}

function smokeTaggedSpecs(specs) {
  // Two narrowings, both because Playwright's --grep matches TEST TITLES and
  // nothing else. Comments are stripped first, then the tag must actually sit
  // in a test()/describe() title -- `@smoke` in a string literal or a run
  // instruction selects no test, so counting it claimed a spec runs when it
  // does not. Either way the gate would have passed on an unexecuted spec.
  return specs.filter((s) =>
    hasSmokeTitle(
      stripComments(readFileSync(path.join(E2E_ROOT, s), "utf8"), "ts"),
    ),
  );
}

function a1DeclaredSpecs() {
  const result = spawnSync(
    "npx",
    ["--no-install", "tsx", "scripts/ci/producers/a1-core-journeys.ts", "--list-specs"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    // Asking the producer and being refused is not the same as the producer
    // declaring nothing. Treating it as an empty list would silently turn every
    // A1 claim into a false claim.
    throw new Error(
      `could not ask the A1 producer for its spec list: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function workflowNamedSpecs(specs) {
  const map = new Map();
  for (const wf of readdirSync(WORKFLOWS)) {
    if (!wf.endsWith(".yml") && !wf.endsWith(".yaml")) continue;
    // Same reason as smokeTaggedSpecs: a spec named in a YAML comment is not
    // run by that workflow, and must not be recorded as covered by it.
    //
    // mentionsSpec, not includes(): one spec's basename appearing inside
    // another's used to count. `auth.spec.ts` sits inside
    // `invite-tech-google-oauth.spec.ts`, and `health.spec.ts` inside
    // `crm-health.spec.ts` -- both live in this repo right now.
    const text = stripComments(
      readFileSync(path.join(WORKFLOWS, wf), "utf8"),
      "yml",
    );
    const named = specs.filter((s) => mentionsSpec(text, s));
    if (named.length) map.set(wf, named);
  }
  return map;
}

function main(argv) {
  let specs;
  try {
    specs = discoverSpecs();
  } catch (error) {
    console.error(`check-e2e-coverage: CANNOT RUN — ${error.message}`);
    return 2;
  }
  if (specs.length === 0) {
    console.error(
      "check-e2e-coverage: CANNOT RUN — discovery found no spec files at all.",
    );
    return 2;
  }

  let smokeTagged;
  let a1Declared;
  let workflowNamed;
  try {
    smokeTagged = smokeTaggedSpecs(specs);
    a1Declared = a1DeclaredSpecs();
    workflowNamed = workflowNamedSpecs(specs);
  } catch (error) {
    console.error(`check-e2e-coverage: CANNOT RUN — ${error.message}`);
    return 2;
  }

  if (argv.includes("--init")) {
    // Emit what is true right now, so the reasons can be written by a person
    // rather than invented by this script.
    for (const spec of specs) {
      let disposition = "unrun:REASON REQUIRED";
      if (smokeTagged.includes(spec)) disposition = "smoke";
      else if (a1Declared.includes(spec) || a1Declared.includes(spec.split("/").pop()))
        disposition = "a1";
      else {
        for (const [wf, named] of workflowNamed) {
          if (named.includes(spec)) {
            disposition = `workflow:${wf}`;
            break;
          }
        }
      }
      console.log(`${spec.padEnd(52)} ${disposition}`);
    }
    return 0;
  }

  let manifest;
  try {
    manifest = parseCoverageManifest(readFileSync(MANIFEST, "utf8"));
  } catch (error) {
    console.error(`check-e2e-coverage: CANNOT RUN — ${error.message}`);
    return 2;
  }

  if (argv.includes("--self-test")) {
    const planted = findCoverageDrift({
      onDisk: ["planted.spec.ts"],
      manifest: new Map([["planted.spec.ts", "smoke"]]),
      smokeTagged: [],
      a1Declared: [],
      workflowNamed: new Map(),
    });
    if (planted.falseClaims.length !== 1) {
      console.error(
        "check-e2e-coverage: SELF-TEST FAILED — a false coverage claim was not reported.",
      );
      return 1;
    }
    const undeclared = findCoverageDrift({
      onDisk: ["a.spec.ts"],
      manifest: new Map(),
      smokeTagged: [],
      a1Declared: [],
      workflowNamed: new Map(),
    });
    if (undeclared.unmentioned.length !== 1) {
      console.error(
        "check-e2e-coverage: SELF-TEST FAILED — an undeclared spec was not reported.",
      );
      return 1;
    }
    console.log(
      "check-e2e-coverage: self-test OK — false claims and undeclared specs both report.",
    );
    return 0;
  }

  const drift = findCoverageDrift({
    onDisk: specs,
    manifest,
    smokeTagged,
    a1Declared,
    workflowNamed,
  });

  for (const f of drift.unmentioned) {
    console.error(
      `check-e2e-coverage: UNDECLARED — ${f} exists but the manifest does not mention it.`,
    );
  }
  for (const f of drift.missing) {
    console.error(
      `check-e2e-coverage: STALE — the manifest names ${f}, which is not on disk.`,
    );
  }
  for (const claim of drift.falseClaims) {
    console.error(`check-e2e-coverage: FALSE CLAIM — ${claim}`);
  }

  const tally = summarise(manifest);
  console.log(
    `check-e2e-coverage: ${tally.total} e2e spec(s) — ${tally.executed} executed by a named mechanism, ` +
      `${tally.unrun} declared unrun with a reason.`,
  );
  if (argv.includes("--summary")) {
    for (const [spec, disposition] of manifest) {
      if (disposition.startsWith("unrun:")) {
        console.log(`  unrun: ${spec} — ${disposition.slice("unrun:".length).trim()}`);
      }
    }
  }

  const failed =
    drift.unmentioned.length + drift.missing.length + drift.falseClaims.length;
  if (failed) {
    console.error(
      "A spec may only go unrun if somebody wrote down why, and a coverage claim must be true. " +
        "Update scripts/ci/e2e-coverage-manifest.txt.",
    );
    return 1;
  }
  return 0;
}

// `file://${process.argv[1]}` is not a correct file URL: a path containing a
// space (or a Windows backslash) encodes differently, the comparison silently
// fails, main() never runs, and the process exits 0 having checked NOTHING.
// Proved 2026-09-07 by invoking this gate through a directory with a space in
// its name: zero output, exit 0, gate fully disarmed while looking green.
// `pathToFileURL` is the encoding-correct form, and is what audit-api-routes.ts,
// audit-env.ts, supabase-advisor-gate.ts and pg-ssl-for-migrate.mjs already use.
// Raised by independent review.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
