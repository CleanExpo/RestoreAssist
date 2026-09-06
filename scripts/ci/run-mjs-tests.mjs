#!/usr/bin/env node
/**
 * Run the `*.test.mjs` suites, and prove none was silently dropped.
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * `config/vitest.config.js` includes `scripts/**' + '/__tests__/**' + '/*.test.ts`.
 * The `.test.mjs` files sitting next to them matched nothing, so they ran
 * nowhere. Measured 2026-09-06: 12 files, 116 tests, exactly one of them invoked
 * by any workflow. Two assertions were already failing and nobody could have
 * known — one broken by a variable rename, one a deliberate review tripwire
 * (workflow population 20 -> 24) firing into the void. They guard release
 * provenance, production environment verification, migration health and the
 * production deployment block.
 *
 * `pr-checks.yml` had already found this class in the Python suite and written
 * the rule down: a guard CI does not execute is not a guard, and blind discovery
 * is refused because a rename would silently run zero tests. So discovery here
 * is the source of truth and `scripts/ci/mjs-test-manifest.txt` is the decision
 * record: a suite on disk the manifest does not mention FAILS, because the only
 * way a suite may go unrun is if somebody wrote down why.
 *
 *   node scripts/ci/run-mjs-tests.mjs             # run the manifest's `run` set
 *   node scripts/ci/run-mjs-tests.mjs --list      # print the plan, run nothing
 *   node scripts/ci/run-mjs-tests.mjs --self-test # prove the coverage check FAILS
 *
 * Exit 0 = the plan matched the disk and every suite passed.
 * Exit 1 = drift, or a failing suite.
 * Exit 2 = could not run, which is never a pass.
 *
 * Node stdlib only, so no dependency can disarm it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const MANIFEST = path.join(repoRoot, "scripts", "ci", "mjs-test-manifest.txt");

/** Every `*.test.mjs` under scripts/, repo-relative, sorted. */
export function discover(root = repoRoot) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.mjs")) {
        found.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(root, "scripts"));
  return found.sort();
}

/** @returns {Map<string,string>} repo-relative path -> disposition */
/**
 * main() buckets suites with `=== "run"`, `startsWith("elsewhere:")` and
 * `startsWith("skip:")`. A disposition matching none of those landed the suite
 * in no bucket at all — neither run nor reported — and the gate still exited 0.
 * The drift check could not catch it either, because the file WAS mentioned.
 * So a typo was the one way to disarm a suite silently.
 * Found by independent review (independent cross-vendor review, 2026-09-07).
 */
const KNOWN_EXACT = new Set(["run"]);
const KNOWN_PREFIXES = ["elsewhere:", "skip:"];

export function assertKnownDisposition(entry, disposition) {
  if (KNOWN_EXACT.has(disposition)) return;
  for (const prefix of KNOWN_PREFIXES) {
    if (disposition.startsWith(prefix) && disposition.slice(prefix.length).trim()) {
      return;
    }
  }
  throw new Error(
    `unknown disposition for ${entry}: ${JSON.stringify(disposition)}. ` +
      `Expected one of: run, elsewhere:<where>, skip:<reason>.`,
  );
}

export function readManifest(file = MANIFEST) {
  const out = new Map();
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [entry, ...rest] = line.split(/\s+/);
    const disposition = rest.join(" ").trim();
    if (!disposition) {
      throw new Error(`manifest entry has no disposition: ${entry}`);
    }
    assertKnownDisposition(entry, disposition);
    out.set(entry, disposition);
  }
  return out;
}

/**
 * The one rule that must never regress, extracted so it is testable without
 * touching the filesystem: a file on disk the manifest does not name is DRIFT,
 * and so is a manifest entry naming a file that is gone. Both directions matter
 * — the first lets a new suite go unrun, the second lets a rename quietly
 * disarm one.
 */
export function findDrift(onDisk, manifest) {
  const unmentioned = onDisk.filter((f) => !manifest.has(f));
  const missing = [...manifest.keys()].filter((f) => !onDisk.includes(f));
  return { unmentioned, missing };
}

function selfTest(manifest) {
  // POSITIVE CONTROL. A coverage check that cannot report drift passes on a
  // clean tree exactly as it passes when broken, and from the outside those are
  // the same picture. So show it a file the manifest cannot know about, and
  // separately hide one it does know about.
  const invented = "scripts/ci/__tests__/__invented__.test.mjs";
  const added = findDrift([...manifest.keys(), invented], manifest);
  if (!added.unmentioned.includes(invented)) {
    console.error(
      "run-mjs-tests: SELF-TEST FAILED — an unmentioned suite was not reported.",
    );
    return 1;
  }
  const keys = [...manifest.keys()];
  const renamed = findDrift(
    keys.filter((f) => f !== keys[0]),
    manifest,
  );
  if (renamed.missing.length !== 1) {
    console.error(
      "run-mjs-tests: SELF-TEST FAILED — a vanished suite was not reported.",
    );
    return 1;
  }
  console.log(
    "run-mjs-tests: self-test OK — drift is reported in both directions.",
  );
  return 0;
}

function main(argv) {
  let manifest;
  try {
    manifest = readManifest();
  } catch (error) {
    console.error(`run-mjs-tests: CANNOT RUN — ${error.message}`);
    return 2;
  }

  if (argv.includes("--self-test")) return selfTest(manifest);

  const onDisk = discover();
  if (onDisk.length === 0) {
    // "Found nothing" from a broken walk looks exactly like "there is nothing".
    console.error(
      "run-mjs-tests: CANNOT RUN — discovery found no *.test.mjs at all.",
    );
    return 2;
  }

  const { unmentioned, missing } = findDrift(onDisk, manifest);
  if (unmentioned.length || missing.length) {
    for (const f of unmentioned) {
      console.error(
        `run-mjs-tests: DRIFT — ${f} exists but the manifest does not mention it.`,
      );
    }
    for (const f of missing) {
      console.error(
        `run-mjs-tests: DRIFT — the manifest names ${f}, which is not on disk.`,
      );
    }
    console.error(
      "A suite may only go unrun if somebody wrote down why. Update scripts/ci/mjs-test-manifest.txt.",
    );
    return 1;
  }

  const toRun = onDisk.filter((f) => manifest.get(f) === "run");
  const elsewhere = onDisk.filter((f) =>
    manifest.get(f).startsWith("elsewhere:"),
  );
  const skipped = onDisk.filter((f) => manifest.get(f).startsWith("skip:"));

  console.log(
    `run-mjs-tests: ${onDisk.length} suite(s) on disk — ${toRun.length} run here, ` +
      `${elsewhere.length} run in another workflow, ${skipped.length} skipped with a reason.`,
  );
  for (const f of elsewhere) console.log(`  elsewhere: ${f} (${manifest.get(f)})`);
  for (const f of skipped) console.log(`  skipped:   ${f} (${manifest.get(f)})`);

  if (argv.includes("--list")) {
    for (const f of toRun) console.log(`  run:       ${f}`);
    return 0;
  }

  if (toRun.length === 0) {
    console.error(
      "run-mjs-tests: CANNOT RUN — the manifest marks nothing to run here.",
    );
    return 2;
  }

  const result = spawnSync(process.execPath, ["--test", ...toRun], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`run-mjs-tests: CANNOT RUN — ${result.error.message}`);
    return 2;
  }
  // A signal-terminated child reports status === null. Treating that as 0 would
  // turn a SIGKILL into a green gate.
  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
