#!/usr/bin/env node
/**
 * RestoreAssist - delete-confirm guard (RA-8395).
 *
 * A browser file that sends `method: "DELETE"` must put that call behind a
 * confirm step. Each page used to decide for itself, so some forgot: a cost
 * item, a homeowner capture link, a floor plan, an AI provider and a Xero
 * mapping were each destroyed by one click.
 *
 * Rule (per file): if a client file under app/ (minus app/api), components/,
 * hooks/ or lib/ contains `method: "DELETE"`, the same file must use one of
 * the shared confirm components listed in CONFIRM_TOKENS. Anything else
 * needs an entry in scripts/delete-confirm-allowlist.json with a one-line
 * reason that a reviewer has checked by opening the file.
 *
 * The allow-list cannot rot: an entry whose file is gone, no longer sends a
 * DELETE, or now uses a confirm token fails the check so the entry is removed.
 *
 * Limits (stated, not hidden): only the literal `method: "DELETE"` is matched,
 * so destructive POST/PATCH calls are not covered, and the rule is per file,
 * so a file that confirms one delete but not another passes.
 *
 * Usage: node scripts/check-delete-confirm.mjs [--root <dir>]
 *   --root scans another tree (for example a `git archive` of an older
 *   commit) with this script's allow-list. Exit 0 clean, 1 findings, 2 error.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = join(HERE, "delete-confirm-allowlist.json");

export const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "__tests__"]);
export const DELETE_RE = /method:\s*["'`]DELETE["'`]/;
// Shared confirm components. DeleteConfirmationDialog wraps AlertDialog.
// Do not add bare "Dialog", "Modal" or "confirm(": they match unrelated
// code and would let an unguarded delete through.
export const CONFIRM_TOKENS = [
  "useConfirmDialog",
  "ConfirmDialog",
  "AlertDialog",
  "DeleteConfirmationDialog",
];

function isTestFile(rel) {
  return /\.(test|spec)\.[jt]sx?$/.test(rel);
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(name)) walk(full, out);
    } else if (EXTS.has(extname(name))) {
      out.push(full);
    }
  }
}

/** Classify one file's text. Pure, so the unit test can plant fixtures. */
export function classify(text) {
  if (!DELETE_RE.test(text)) return "no-delete";
  return CONFIRM_TOKENS.some((t) => text.includes(t)) ? "confirmed" : "unconfirmed";
}

export function scan(root, allow) {
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = join(root, d);
    if (existsSync(abs)) walk(abs, files);
  }
  const failures = [];
  const seen = new Map();
  let deleteFiles = 0;
  for (const full of files) {
    const rel = relative(root, full).split("\\").join("/");
    if (rel.startsWith("app/api/") || isTestFile(rel)) continue;
    const verdict = classify(readFileSync(full, "utf8"));
    seen.set(rel, verdict);
    if (verdict === "no-delete") continue;
    deleteFiles++;
    if (verdict === "unconfirmed" && !allow.has(rel)) failures.push(rel);
  }
  const stale = [];
  for (const rel of allow.keys()) {
    const v = seen.get(rel);
    if (v !== "unconfirmed") stale.push({ rel, why: v ?? "file not found" });
  }
  return { scanned: seen.size, deleteFiles, failures: failures.sort(), stale };
}

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  const allow = new Map();
  for (const e of raw.entries ?? []) {
    if (typeof e.file !== "string" || typeof e.reason !== "string" || !e.reason.trim()) {
      throw new Error(`allow-list entry needs a file and a reason: ${JSON.stringify(e)}`);
    }
    allow.set(e.file, e.reason);
  }
  return allow;
}

function main() {
  const i = process.argv.indexOf("--root");
  const root = i > -1 ? resolve(process.argv[i + 1] ?? "") : process.cwd();
  let allow;
  try {
    allow = loadAllowlist();
  } catch (err) {
    console.error(`delete-confirm: cannot read allow-list: ${err.message}`);
    process.exit(2);
  }
  const r = scan(root, allow);
  if (r.scanned === 0) {
    console.error(`delete-confirm: no client files found under ${root}; refusing to report clean`);
    process.exit(2);
  }
  console.log(
    `delete-confirm: ${r.scanned} client files, ${r.deleteFiles} send a DELETE, ${allow.size} allow-listed`,
  );
  for (const f of r.failures) console.log(`  FAIL ${f}`);
  for (const s of r.stale) console.log(`  STALE allow-list entry ${s.rel} (${s.why}); remove it`);
  if (r.failures.length || r.stale.length) {
    console.log(
      'Put the DELETE behind useConfirmDialog().ask({ ..., destructive: true }) from components/ConfirmDialog.tsx,',
    );
    console.log("or add a reviewed entry with a one-line reason to scripts/delete-confirm-allowlist.json.");
    process.exit(1);
  }
  console.log("delete-confirm: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
