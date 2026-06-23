#!/usr/bin/env node
/**
 * RestoreAssist - generic emoji guard.
 *
 * Fails if standard Unicode emojis appear in app / src / components / prompts /
 * docs. Use branded `[ra:name]` tokens instead - see
 * prompts/no-generic-emojis.md and docs/RESTOREASSIST_ICON_SYSTEM.md.
 *
 * Opt out a single line by adding the marker `ra-allow-emoji` to it.
 *
 * Usage:  node scripts/check-no-emoji.mjs   (or: pnpm check:no-emoji)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "src", "components", "prompts", "docs"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".mdx"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
]);
const ALLOW_MARKER = "ra-allow-emoji";
const SELF = "scripts/check-no-emoji.mjs";

// Curated emoji ranges: misc symbols, dingbats, supplemental symbols and
// arrows-B, pictographs, regional-indicator flags, and the VS16 emoji
// selector. Deliberately excludes (c)/(r)/(tm) and plain arrows to avoid
// false positives. Escapes only, so this guard stays emoji-free itself.
function emojiMatcher() {
  return /(?:[☀-⛿✀-➿⬀-⯿]|️|[\u{1F000}-\u{1FAFF}]|[\u{1F1E6}-\u{1F1FF}])/gu;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) walk(p, out);
    } else if (EXTS.has(extname(entry))) {
      out.push(p);
    }
  }
}

function codePoints(grapheme) {
  return [...grapheme]
    .map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
    .join(" ");
}

const files = [];
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);

const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (rel === SELF) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.includes(ALLOW_MARKER)) return;
    const matches = line.match(emojiMatcher());
    if (!matches) return;
    for (const ch of matches) {
      findings.push({ rel, line: idx + 1, ch, cp: codePoints(ch) });
    }
  });
}

if (findings.length === 0) {
  console.log(
    "check:no-emoji - OK. No generic Unicode emojis in app/src/components/prompts/docs.",
  );
  process.exit(0);
}

const fileCount = new Set(findings.map((f) => f.rel)).size;
console.error(
  `check:no-emoji - found ${findings.length} generic emoji(s) in ${fileCount} file(s).`,
);
console.error(
  "Replace them with branded [ra:name] tokens. See prompts/no-generic-emojis.md\n",
);

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.rel)) byFile.set(f.rel, []);
  byFile.get(f.rel).push(f);
}
for (const [rel, list] of byFile) {
  console.error(`  ${rel}`);
  for (const f of list.slice(0, 20)) {
    console.error(`    ${f.line}: ${f.ch}  (${f.cp})`);
  }
  if (list.length > 20) console.error(`    ... +${list.length - 20} more`);
}
process.exit(1);
