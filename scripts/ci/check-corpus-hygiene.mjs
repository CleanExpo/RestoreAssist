#!/usr/bin/env node
/**
 * check-corpus-hygiene — front-foot detector for the RAG-corpus-hygiene class.
 *
 * Scans docs staged for ingest and flags CHARGE-OUT DOLLAR patterns — the thing
 * that must never enter the shared vector corpus, because the retriever has no
 * tenancy/tier filter and can surface a price into the wrong answer (RA-7026:
 * the DR-PRICINGGUIDE global rate card, and CARSI training $ rates). Pricing is
 * a live per-tenant injection, never embedded.
 *
 * Importable: `scanText`, `scanDir`, `RATE_PATTERNS` (used by the ingest driver
 * scripts/ingest-standards-remote.ts to abort an ingest that carries rates).
 * CLI:  node scripts/ci/check-corpus-hygiene.mjs --dir <staging-dir> [--strict]
 *
 * See .claude/skills/rag-corpus-hygiene/SKILL.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Charge-out RATE signatures — a number bound to a PER-TIME unit. Deliberately
// NOT matching bare "$1,005 ex-GST" job-value totals (aggregate context is
// lower-risk per the skill); the label:number rate-card form (e.g. "Labourer:
// 70" under a "per hour" heading) is left to the manual pre-ingest checklist.
export const RATE_PATTERNS = [
  /\$\s?\d[\d,]*(?:\.\d+)?\s?\/\s?(?:hr|hour|day)\b/i, // $440/hr, $150/day
  /\$\s?\d[\d,]*(?:\.\d+)?\s?per\s?(?:hour|day)\b/i, // $120 per day, $800 per hour
  /\b\d{2,4}\s?(?:per\s?(?:hour|day)|\/\s?(?:hr|day))\b/i, // 120 per day, 85/hr
  /\b(?:hourly|daily|day)\s?rate\b[^.\n]{0,20}?\$\s?\d{2,4}\b/i, // "Hourly Rate - $800"
];

/** Lines in `text` that carry a charge-out rate pattern. */
export function scanText(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (RATE_PATTERNS.some((re) => re.test(line))) {
      out.push({ line: i + 1, text: line.trim().slice(0, 120) });
    }
  });
  return out;
}

/** All {file,line,text} rate hits under `dir` (.txt/.md, recursive). */
export function scanDir(dir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(txt|md)$/i.test(name)) files.push(p);
    }
  };
  walk(dir);
  const hits = [];
  for (const file of files) {
    for (const h of scanText(readFileSync(file, "utf8"))) hits.push({ file, ...h });
  }
  return { files, hits };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx !== -1 ? args[dirIdx + 1] : null;
  const strict = args.includes("--strict");
  if (!dir) {
    console.error("usage: check-corpus-hygiene.mjs --dir <staging-dir> [--strict]");
    process.exit(2);
  }
  let result;
  try {
    result = scanDir(dir);
  } catch (e) {
    console.error(`check-corpus-hygiene - cannot read dir: ${dir} (${e.message})`);
    process.exit(2);
  }
  if (result.hits.length === 0) {
    console.log(
      `check-corpus-hygiene - OK. No charge-out rate patterns in ${result.files.length} staged doc(s).`,
    );
    process.exit(0);
  }
  console.log(
    `check-corpus-hygiene - ${result.hits.length} charge-out rate pattern(s) — these must NOT enter the corpus:\n`,
  );
  for (const h of result.hits) console.log(`  ${h.file}:${h.line}\n      ${h.text}`);
  console.log(
    "\nPricing is a live per-tenant injection (OrganizationPricingConfig), never embedded. " +
      "Move these out before ingest. See .claude/skills/rag-corpus-hygiene/SKILL.md.",
  );
  process.exit(strict ? 1 : 0);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
