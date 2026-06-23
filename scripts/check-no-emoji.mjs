#!/usr/bin/env node
/**
 * RestoreAssist - generic emoji guard.
 *
 * Fails if standard Unicode emojis appear in app / src / components / prompts /
 * docs. Use branded `[ra:name]` tokens instead - see
 * prompts/no-generic-emojis.md and docs/RESTOREASSIST_ICON_SYSTEM.md.
 *
 * Modes:
 *   (default)            Ratchet mode. Fails only when a file has MORE emojis
 *                        than its recorded baseline (scripts/emoji-baseline.json)
 *                        or a non-baselined file contains any. Blocks NEW emojis
 *                        while the historical backlog burns down.
 *   --strict             Fails on ANY emoji (the end goal once the backlog is 0).
 *   --update-baseline    Rewrites the baseline from the current tree, then exits.
 *
 * Per-line opt-out: add the marker `ra-allow-emoji` to a line to exclude it.
 *
 * Usage:  node scripts/check-no-emoji.mjs [--strict|--update-baseline]
 *         pnpm check:no-emoji
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
const BASELINE_PATH = join(ROOT, "scripts", "emoji-baseline.json");

const MODE = process.argv.includes("--strict")
  ? "strict"
  : process.argv.includes("--update-baseline")
    ? "update"
    : "ratchet";

// Curated emoji ranges: misc symbols, dingbats, supplemental symbols and
// arrows-B, pictographs, regional-indicator flags, and the VS16 emoji
// selector. Deliberately excludes (c)/(r)/(tm) and plain arrows to avoid
// false positives.
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

/** Scan all target files. Returns { counts: Map<rel,n>, findings: [...] }. */
function scan() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);
  const counts = new Map();
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
    let n = 0;
    text.split(/\r?\n/).forEach((line, idx) => {
      if (line.includes(ALLOW_MARKER)) return;
      const matches = line.match(emojiMatcher());
      if (!matches) return;
      n += matches.length;
      for (const ch of matches) {
        findings.push({ rel, line: idx + 1, ch, cp: codePoints(ch) });
      }
    });
    if (n > 0) counts.set(rel, n);
  }
  return { counts, findings };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files ?? {};
  } catch {
    return {};
  }
}

const { counts, findings } = scan();

if (MODE === "update") {
  const files = Object.fromEntries([...counts.entries()].sort());
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const payload = {
    note:
      "Baseline of pre-existing Unicode emojis. The guard blocks any increase. " +
      "Regenerate after removing emojis to ratchet the limit down. " +
      "See docs/RESTOREASSIST_ICON_SYSTEM.md.",
    total,
    files,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `check:no-emoji - baseline updated: ${total} emoji(s) across ${counts.size} file(s) -> ${relative(ROOT, BASELINE_PATH)}`,
  );
  process.exit(0);
}

const baseline = MODE === "strict" ? {} : loadBaseline();

// Violations: a file exceeds its allowed (baseline) count.
const violations = [];
for (const [rel, n] of counts) {
  const allowed = baseline[rel] ?? 0;
  if (n > allowed) violations.push({ rel, n, allowed });
}

if (violations.length === 0) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (MODE === "strict") {
    console.log("check:no-emoji (strict) - OK. No generic Unicode emojis found.");
  } else {
    console.log(
      `check:no-emoji - OK. No new emojis beyond baseline (${total} known, ratcheting down).`,
    );
  }
  process.exit(0);
}

const violationFiles = new Set(violations.map((v) => v.rel));
console.error(
  MODE === "strict"
    ? `check:no-emoji (strict) - found generic emojis in ${violationFiles.size} file(s).`
    : `check:no-emoji - ${violations.length} file(s) exceed the emoji baseline (new emojis added).`,
);
console.error(
  "Use branded [ra:name] tokens (see prompts/no-generic-emojis.md), remove the emoji,",
);
console.error(
  "or - for the historical backlog only - run `node scripts/check-no-emoji.mjs --update-baseline`.\n",
);

const byFile = new Map();
for (const f of findings) {
  if (!violationFiles.has(f.rel)) continue;
  if (!byFile.has(f.rel)) byFile.set(f.rel, []);
  byFile.get(f.rel).push(f);
}
for (const v of violations) {
  console.error(`  ${v.rel}  (${v.n} found, ${v.allowed} allowed)`);
  for (const f of (byFile.get(v.rel) ?? []).slice(0, 12)) {
    console.error(`    ${f.line}: ${f.ch}  (${f.cp})`);
  }
  const extra = (byFile.get(v.rel) ?? []).length - 12;
  if (extra > 0) console.error(`    ... +${extra} more`);
}
process.exit(1);
