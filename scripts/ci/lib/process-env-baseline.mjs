// RA-7784 — keeps config/process-env-baseline.json honest.
//
// The baseline turns the process-env lint rule off for files that read env
// today. This check re-lints every baselined file with the rule forced ON and
// fails when an entry is stale: the file is gone, or it no longer reads env
// (so it must leave the baseline and stay clean). `--write` regenerates the
// list from a lint of the whole repo; review the diff, it must only shrink.
import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import {
  PROCESS_ENV_ALLOWED_FILES,
  PROCESS_ENV_BASELINE_PATH,
  PROCESS_ENV_TEST_GLOBS,
  PROCESS_ENV_SELECTORS,
  readProcessEnvBaseline,
} from "../../../config/eslint-process-env.mjs";

const RULE = "no-restricted-syntax";

function eslintWithRuleOn(repoRoot) {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, "config/eslint.config.mjs"),
    // Applied after the baseline block, so baselined files are linted too.
    overrideConfig: {
      files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
      // Same scope as the lint rule: tests and the named exceptions never count.
      ignores: [...PROCESS_ENV_TEST_GLOBS, ...PROCESS_ENV_ALLOWED_FILES.map((a) => a.file)],
      rules: { [RULE]: ["error", ...PROCESS_ENV_SELECTORS] },
    },
    ruleFilter: ({ ruleId }) => ruleId === RULE,
    errorOnUnmatchedPattern: false,
  });
}

function filesWithViolations(results, repoRoot) {
  const files = new Set();
  for (const r of results) {
    if (r.messages.some((m) => m.ruleId === RULE)) {
      files.add(path.relative(repoRoot, r.filePath).split(path.sep).join("/"));
    }
  }
  return files;
}

export async function main(argv, { repoRoot = process.cwd(), log = console.log, error = console.error } = {}) {
  const write = argv.includes("--write");
  const baseline = readProcessEnvBaseline();

  if (write) {
    const results = await eslintWithRuleOn(repoRoot).lintFiles(["."]);
    const files = [...filesWithViolations(results, repoRoot)].sort();
    const added = files.filter((f) => !baseline.includes(f));
    const raw = JSON.parse(fs.readFileSync(PROCESS_ENV_BASELINE_PATH, "utf8"));
    fs.writeFileSync(PROCESS_ENV_BASELINE_PATH, `${JSON.stringify({ ...raw, files }, null, 2)}\n`);
    log(`process-env baseline: ${files.length} files (was ${baseline.length})`);
    if (added.length > 0) {
      error(`WARNING: --write added ${added.length} file(s); the baseline must only shrink:`);
      for (const f of added) error(`  ${f}`);
      return 1;
    }
    return 0;
  }

  const problems = [];
  const sorted = [...baseline].sort();
  if (new Set(baseline).size !== baseline.length) problems.push("baseline has duplicate entries");
  if (sorted.some((f, i) => f !== baseline[i])) problems.push("baseline is not sorted");
  const present = baseline.filter((f) => {
    if (fs.existsSync(path.join(repoRoot, f))) return true;
    problems.push(`${f}: baselined but the file no longer exists; remove it`);
    return false;
  });
  // The committed config must actually switch the rule off for every entry.
  // A path that is accidentally glob syntax (`[id]`, `(group)`) would match
  // nothing and leave lint red, or worse, match something else.
  const plain = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, "config/eslint.config.mjs"),
  });
  for (const f of present) {
    const config = await plain.calculateConfigForFile(path.join(repoRoot, f));
    const setting = config?.rules?.[RULE];
    const severity = Array.isArray(setting) ? setting[0] : setting;
    if (severity !== 0 && severity !== "off") {
      problems.push(`${f}: baselined, but the lint config does not exempt it (pattern did not match)`);
    }
  }
  const results = await eslintWithRuleOn(repoRoot).lintFiles(present);
  const violating = filesWithViolations(results, repoRoot);
  for (const f of present) {
    if (!violating.has(f)) problems.push(`${f}: baselined but no longer reads process; remove it from config/process-env-baseline.json`);
  }

  if (problems.length > 0) {
    error(`check:process-env-baseline FAILED (${problems.length}):`);
    for (const p of problems) error(`  ${p}`);
    return 1;
  }
  log(`check:process-env-baseline OK: ${baseline.length} baselined files, all still reading process directly`);
  return 0;
}
