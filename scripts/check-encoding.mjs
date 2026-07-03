#!/usr/bin/env node
/**
 * RestoreAssist - UTF-8 encoding guard.
 *
 * Fails if any agent-instruction / rule file is not valid UTF-8 text. This
 * catches the mojibake-corruption class (RA-6938): CLAUDE.md was silently
 * committed as invalid-UTF-8 "data" from the Commands section onward, turning
 * the primary agent brief into garbage the model could not read.
 *
 * Checked files:
 *   - CLAUDE.md
 *   - AGENTS.md            (if present)
 *   - .claude/rules/*.md
 *
 * A file passes when its bytes decode as UTF-8 with no replacement/invalid
 * sequences. Fast and dependency-free (Node's fatal TextDecoder).
 *
 * Usage:  node scripts/check-encoding.mjs
 *         pnpm check:encoding
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Explicit files + a glob-equivalent for .claude/rules/*.md. */
function targets() {
  const files = [];
  for (const rel of ["CLAUDE.md", "AGENTS.md"]) {
    const p = join(ROOT, rel);
    if (existsSync(p)) files.push(p);
  }
  const rulesDir = join(ROOT, ".claude", "rules");
  if (existsSync(rulesDir)) {
    for (const entry of readdirSync(rulesDir)) {
      if (entry.endsWith(".md")) files.push(join(rulesDir, entry));
    }
  }
  return files;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];

for (const file of targets()) {
  const rel = relative(ROOT, file).split("\\").join("/");
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (err) {
    failures.push({ rel, reason: `unreadable: ${err.message}` });
    continue;
  }
  try {
    decoder.decode(bytes);
  } catch (err) {
    // Report the byte offset of the first invalid sequence for triage.
    let offset = null;
    for (let i = 1; i <= bytes.length; i++) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, i));
      } catch {
        offset = i - 1;
        break;
      }
    }
    failures.push({
      rel,
      reason: `invalid UTF-8${offset === null ? "" : ` at byte ${offset}`} (${err.message})`,
    });
  }
}

if (failures.length === 0) {
  console.log(
    "check:encoding - OK. All agent-instruction / rule files are valid UTF-8 text.",
  );
  process.exit(0);
}

console.error(
  `check:encoding - ${failures.length} file(s) are not valid UTF-8 text:`,
);
for (const f of failures) {
  console.error(`  ${f.rel}  ${f.reason}`);
}
console.error(
  "\nRestore the file from the last clean commit and re-save as UTF-8. See RA-6938.\n",
);
process.exit(1);
