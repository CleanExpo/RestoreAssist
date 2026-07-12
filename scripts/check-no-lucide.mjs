#!/usr/bin/env node
/**
 * RestoreAssist - lucide-react import guard (Phill Rule 1, .claude/DESIGN.md).
 *
 * DESIGN.md forbids NET-NEW generic icon-library imports (lucide-react,
 * @heroicons/react, @fortawesome/*) in app code — use the branded RAIcon /
 * [ra:*] system instead (src/components/brand/RAIcon.tsx,
 * docs/RESTOREASSIST_ICON_SYSTEM.md). This guard finally ENFORCES that rule,
 * mirroring the existing emoji guard (scripts/check-no-emoji.mjs).
 *
 * Modes:
 *   (default)            Ratchet mode. Fails only when a file imports lucide-react
 *                        MORE times than its recorded baseline
 *                        (scripts/lucide-baseline.json), or a non-baselined file
 *                        imports it at all. Blocks NEW usage while the historical
 *                        backlog migrates to RAIcon.
 *   --strict             Fails on ANY lucide-react import (the end goal once the
 *                        backlog is 0).
 *   --update-baseline    Rewrites the baseline from the current tree, then exits.
 *
 * Per-line opt-out: add the marker `ra-allow-lucide` to a line to exclude it.
 *
 * Usage:  node scripts/check-no-lucide.mjs [--strict|--update-baseline]
 *         pnpm check:no-lucide
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "src", "components"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);
const ALLOW_MARKER = "ra-allow-lucide";
const SELF = "scripts/check-no-lucide.mjs";
const BASELINE_PATH = join(ROOT, "scripts", "lucide-baseline.json");
// Matches:  from 'lucide-react'   |   from "lucide-react/..."   |  require('lucide-react')
const LUCIDE_RE = /(from\s+['"]lucide-react|require\(\s*['"]lucide-react)/;

const MODE = process.argv.includes("--strict")
  ? "strict"
  : process.argv.includes("--update-baseline")
  ? "update"
  : "ratchet";

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(name)) walk(full, out);
    } else if (EXTS.has(extname(name))) {
      out.push(full);
    }
  }
}

function countFile(full) {
  let n = 0;
  const text = readFileSync(full, "utf8");
  for (const line of text.split("\n")) {
    if (LUCIDE_RE.test(line) && !line.includes(ALLOW_MARKER)) n++;
  }
  return n;
}

// Gather current counts
const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  if (existsSync(abs)) walk(abs, files);
}
const current = {};
let total = 0;
for (const full of files) {
  const rel = relative(ROOT, full).split("\\").join("/");
  if (rel === SELF) continue;
  const n = countFile(full);
  if (n > 0) { current[rel] = n; total += n; }
}

if (MODE === "update") {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    note: "Baseline of pre-existing lucide-react imports. The guard blocks any increase. Regenerate after migrating icons to RAIcon to ratchet the limit down. See docs/RESTOREASSIST_ICON_SYSTEM.md.",
    total,
    files: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`check:no-lucide - baseline written: ${total} imports across ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

if (MODE === "strict") {
  if (total === 0) { console.log("check:no-lucide (strict) - OK. Zero lucide-react imports."); process.exit(0); }
  console.error(`check:no-lucide (strict) - FAIL: ${total} lucide-react import(s) remain across ${Object.keys(current).length} files. Migrate to RAIcon.`);
  process.exit(1);
}

// Ratchet mode
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files || {}
  : {};
const violations = [];
for (const [rel, n] of Object.entries(current)) {
  const allowed = baseline[rel] || 0;
  if (n > allowed) violations.push(`  ${rel}: ${n} (baseline ${allowed})`);
}
if (violations.length) {
  console.error("check:no-lucide - FAIL: net-new lucide-react imports beyond baseline (Phill Rule 1).");
  console.error("Use the branded RAIcon / [ra:*] system — see docs/RESTOREASSIST_ICON_SYSTEM.md.");
  console.error("If a file's baseline legitimately dropped, run: node scripts/check-no-lucide.mjs --update-baseline");
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`check:no-lucide - OK. No new lucide-react imports beyond baseline (${total} known, ratcheting down).`);
process.exit(0);
