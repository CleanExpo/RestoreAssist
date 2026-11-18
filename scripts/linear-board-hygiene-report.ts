#!/usr/bin/env npx tsx
/**
 * RA-7555 — read-only evidence report for Linear board hygiene.
 *
 * Scans lib/linear/board-hygiene-evidence.ts entries against the working tree
 * and prints suggested states + comment snippets for manual paste into Linear.
 *
 *   npm run script:linear-board-hygiene
 *   npm run script:linear-board-hygiene -- --id RA-7754,RA-8094
 */
import fs from "node:fs";
import path from "node:path";
import {
  BOARD_HYGIENE_EVIDENCE,
  type BoardHygieneEntry,
  type HygieneCheck,
} from "../lib/linear/board-hygiene-evidence";

const repoRoot = path.resolve(import.meta.dirname, "..");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v?.startsWith("--") ? undefined : v;
}

function checkOne(check: HygieneCheck): { ok: boolean; detail: string } {
  const full = path.join(repoRoot, check.path);
  if (check.kind === "file") {
    const ok = fs.existsSync(full);
    return { ok, detail: ok ? "file present" : "file missing" };
  }
  if (!fs.existsSync(full)) {
    return { ok: false, detail: "file missing for grep" };
  }
  if (fs.statSync(full).isDirectory()) {
    return { ok: false, detail: "path is a directory — use a file path" };
  }
  const text = fs.readFileSync(full, "utf8");
  const re = new RegExp(check.pattern);
  const ok = re.test(text);
  return {
    ok,
    detail: ok ? "pattern matched" : `pattern not found: ${check.pattern}`,
  };
}

function evaluate(entry: BoardHygieneEntry) {
  const results = entry.checks.map((c) => ({
    check: c,
    ...checkOne(c),
  }));
  const pass = results.every((r) => r.ok);
  return { entry, results, pass };
}

const filterIds = flag("id")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let entries = BOARD_HYGIENE_EVIDENCE;
if (filterIds?.length) {
  entries = entries.filter((e) => filterIds.includes(e.id));
}

console.log("# RA-7555 board hygiene report\n");
console.log(`Repo: ${repoRoot}`);
console.log(`Generated: ${new Date().toISOString()}\n`);

let passCount = 0;
let failCount = 0;

for (const { entry, results, pass } of entries.map(evaluate)) {
  if (pass) passCount++;
  else failCount++;

  console.log(`## ${entry.id} — ${entry.title}`);
  console.log(
    `Suggested state: **${pass ? entry.ifPassSuggest : entry.ifFailSuggest}** (${pass ? "evidence OK" : "evidence missing"})\n`,
  );
  for (const r of results) {
    const label =
      r.check.kind === "file"
        ? r.check.path
        : `${r.check.path} ~ /${r.check.pattern}/`;
    console.log(`- [${r.ok ? "x" : " "}] ${label} — ${r.detail}`);
  }
  if (entry.testHint) {
    console.log(`- Test hint: \`${entry.testHint}\``);
  }
  if (pass && entry.commentTemplate) {
    console.log(`\nComment (paste if closing):\n> ${entry.commentTemplate}\n`);
  } else if (!pass) {
    console.log("\nKeep open until checks pass on main.\n");
  }
  console.log("---\n");
}

console.log(`Summary: ${passCount} pass, ${failCount} need attention.`);
