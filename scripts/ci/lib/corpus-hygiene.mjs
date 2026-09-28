/**
 * Corpus-hygiene detector. Importing this module does not scan and does not
 * exit. The CLI entry `scripts/ci/check-corpus-hygiene.mjs` calls `main()`.
 *
 * Scans docs staged for ingest and flags CHARGE-OUT DOLLAR patterns — the thing
 * that must never enter the shared vector corpus, because the retriever has no
 * tenancy/tier filter and can surface a price into the wrong answer (RA-7026:
 * the DR-PRICINGGUIDE global rate card, and CARSI training $ rates). Pricing is
 * a live per-tenant injection, never embedded.
 *
 * `scanText` is used by `scripts/ingest-standards-remote.ts` to abort an ingest
 * that carries rates.
 *
 * Exit 0 — at least one .txt/.md scanned, and no rate hits (or hits without --strict).
 * Exit 1 — rate hits and --strict.
 * Exit 2 — missing --dir, unreadable dir, or zero .txt/.md files. A usage
 * error or an empty scan is never exit 0.
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

/**
 * Run the CLI. Returns the process exit code. Does not call `process.exit`.
 * `argv` defaults to `process.argv.slice(2)`.
 */
export function main(argv = process.argv.slice(2)) {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx !== -1 ? argv[dirIdx + 1] : null;
  const strict = argv.includes("--strict");
  if (!dir) {
    console.error("usage: check-corpus-hygiene.mjs --dir <staging-dir> [--strict]");
    return 2;
  }
  let result;
  try {
    result = scanDir(dir);
  } catch (e) {
    console.error(`check-corpus-hygiene - cannot read dir: ${dir} (${e.message})`);
    return 2;
  }
  if (result.files.length === 0) {
    console.error(
      `check-corpus-hygiene - no .txt/.md files under ${dir}. An empty scan is not a pass.`,
    );
    return 2;
  }
  if (result.hits.length === 0) {
    console.log(
      `check-corpus-hygiene - OK. No charge-out rate patterns in ${result.files.length} staged doc(s).`,
    );
    return 0;
  }
  console.log(
    `check-corpus-hygiene - ${result.hits.length} charge-out rate pattern(s) — these must NOT enter the corpus:\n`,
  );
  for (const h of result.hits) console.log(`  ${h.file}:${h.line}\n      ${h.text}`);
  console.log(
    "\nPricing is a live per-tenant injection (OrganizationPricingConfig), never embedded. " +
      "Move these out before ingest. See .claude/skills/rag-corpus-hygiene/SKILL.md.",
  );
  return strict ? 1 : 0;
}
