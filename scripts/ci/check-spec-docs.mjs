#!/usr/bin/env node
/**
 * check-spec-docs — pre-merge documentation-layout guard.
 *
 * Born from PR #1968: a clean `git merge origin/main` silently relocated the
 * canonical master spec into docs/root-archive/ via rename detection (main had
 * moved the OLD root spec.md there in c84fc196). GitHub showed a technically
 * clean merge while the source-of-truth document sat in an archive folder.
 *
 * Guards, in order:
 *   1. Archive isolation — nothing under docs/root-archive/ may carry the
 *      CANONICAL status header. The archive holds superseded content only.
 *   2. Header sanity — at most ONE markdown file in the repo declares itself
 *      the canonical master specification.
 *   3. Root presence — if a canonical spec exists, it lives at root spec.md.
 *   4. Link integrity — every docs/**.md path referenced from spec.md exists.
 *
 * Vacuously passes while no canonical spec exists (pre-#1968 main), so it can
 * land ahead of the spec PR without going red.
 *
 * CLI: node scripts/ci/check-spec-docs.mjs [rootDir]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] || process.cwd();
const CANONICAL_RE = /^\*\*Status:\*\* CANONICAL/m;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "mobile"]);

function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry) && !entry.startsWith(".")) yield* mdFiles(p);
    } else if (entry.endsWith(".md")) {
      yield p;
    }
  }
}

const canonical = [];
for (const f of mdFiles(ROOT)) {
  if (CANONICAL_RE.test(readFileSync(f, "utf8"))) canonical.push(relative(ROOT, f));
}

const errors = [];

const archived = canonical.filter((f) => f.startsWith("docs/root-archive/"));
if (archived.length) {
  errors.push(`archive isolation: CANONICAL header inside docs/root-archive/: ${archived.join(", ")}`);
}

if (canonical.length > 1) {
  errors.push(`header sanity: ${canonical.length} files declare CANONICAL status: ${canonical.join(", ")}`);
}

if (canonical.length >= 1 && !canonical.includes("spec.md")) {
  errors.push(`root presence: canonical spec found at ${canonical.join(", ")} but not at root spec.md`);
}

const specPath = join(ROOT, "spec.md");
if (existsSync(specPath)) {
  const body = readFileSync(specPath, "utf8");
  const refs = [...new Set((body.match(/docs\/[A-Za-z0-9/_.-]+\.md/g) || []))];
  for (const ref of refs) {
    if (!existsSync(join(ROOT, ref))) errors.push(`link integrity: spec.md references missing file ${ref}`);
  }
}

if (errors.length) {
  console.error(`check:spec-docs FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  canonical.length
    ? `check:spec-docs OK — canonical spec at ${canonical[0]}, archive clean, links resolve.`
    : "check:spec-docs OK — no canonical spec present yet (vacuous pass)."
);
