/**
 * Regulatory registry integrity gate.
 *
 * Built BEFORE the content it guards, deliberately. The defect that prompted it
 * was not a missing regulation -- it was nine files agreeing with each other and
 * none of them with the law: asbestos presumed from 1990 (Queensland's REGISTER
 * exemption, applied nationally) and from 1987 in NSW (a cutoff that does not
 * exist). Content without enforcement regenerates that state within a release.
 *
 * Four rules:
 *
 *   1. ENTRY INTEGRITY  every entry carries a real instrument, requirement,
 *      https source, ISO `verifiedAt` that is not in the future, a known
 *      `verification` kind, and an ISO `effectiveFrom`. Ids are unique and
 *      dotted.
 *
 *   2. STALENESS  `verifiedAt` older than MAX_VERIFIED_AGE_DAYS fails. Silica
 *      changed twice in 2024; lead blood-level triggers in 2025; workplace
 *      exposure standards become limits in December 2026. A table with no
 *      re-check date is wrong within a year.
 *
 *   3. UNKNOWN REFERENCE  any `regulation("...")` call naming an id the registry
 *      does not hold. A document must not render with a blank where the law goes.
 *
 *   4. HARD-CODED REGULATORY YEAR  a year-threshold sitting next to a regulatory
 *      keyword anywhere outside the registry. This is the rule that would have
 *      caught the original defect on the commit that introduced it.
 *
 * Rules 1-3 hard-fail: they concern the registry itself, which is new and clean.
 * Rule 4 is BASELINED, following the same idiom as check-no-emoji: the tree
 * already carries 58 such lines, and fixing them all in one diff would bury the
 * gate in prose edits. The baseline records what exists; ANY increase fails. So
 * the rule cannot stop the existing backlog, but it does stop the next
 * "pre-1990" from being added -- which is the case that mattered.
 *
 *   --strict            ignore the baseline; report every hard-coded year.
 *   --update-baseline   rewrite the baseline from the current tree, then exit.
 *
 * Escape hatch: `regulatory-year-ignore` on a line, for prose that documents a
 * past mistake rather than asserting a rule. Same idiom as
 * `standards-cite-ignore` in check-standards-citations.ts.
 *
 * Run: npx tsx scripts/check-regulatory-registry.ts
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGULATORY_ENTRIES,
  regulatoryIds,
} from "../lib/compliance/regulatory-registry";
import { VERIFICATION_KINDS } from "../lib/compliance/regulatory-registry/types";

/** How long an entry may go unchecked before the build fails. */
const MAX_VERIFIED_AGE_DAYS = 365;

const REGISTRY_DIR = join("lib", "compliance", "regulatory-registry");
const IGNORE = "regulatory-year-ignore";
const BASELINE_PATH = join("scripts", "regulatory-year-baseline.json");

const MODE = process.argv.includes("--strict")
  ? "strict"
  : process.argv.includes("--update-baseline")
    ? "update"
    : "normal";

function loadBaseline(): Record<string, number> {
  if (MODE === "strict" || !existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files ?? {};
  } catch {
    return {};
  }
}

/** Where a hard-coded regulatory year is a defect. */
const SCAN_ROOTS = ["lib", "app", "components"];
const SCAN_EXT = /\.(ts|tsx)$/;
const SKIP_DIR = /(^|\/)(node_modules|\.next|__tests__|__mocks__)(\/|$)/;

/**
 * Words whose presence turns a bare year into a regulatory assertion. Kept
 * narrow on purpose: a broad list produces noise, and a noisy gate gets ignored.
 */
const REGULATORY_KEYWORD =
  /\b(asbestos|acm\b|silica|crystalline|engineered stone|lead paint|blood[- ]lead|ghs)\b/i;

/**
 * How far from a regulatory keyword a year still counts as asserting a rule.
 *
 * Rule 4 was line-scoped at first and missed the two predicates that mattered:
 * `inspectionContext.buildingYearBuilt < 1990` and `inspectionData.buildingAge
 * < 1990` both sat on lines with no keyword on them, while the surrounding
 * function was entirely about asbestos. CodeRabbit caught both on #2153. A
 * small window catches a threshold split across a condition and its context.
 */
const KEYWORD_WINDOW = 4;

/** "pre-1990", "before 2004", "< 1990", "built after 1989". */
// The leading \b must attach to the WORD alternatives only. Applied to the whole
// group it silently never matched `< 1990`, because there is no word boundary
// between a space and `<` -- so the comparison form, which is what the two live
// predicates actually used, slipped through. The first proof of this rule looked
// green only because its fixture also carried the words "pre-1990".
const YEAR_CLAIM =
  /(?:\bpre-|\bbefore\s+|\bafter\s+|\bsince\s+|[<>]=?\s*)(19[5-9]\d|20[0-4]\d)\b/i;

interface Violation {
  rule: string;
  where: string;
  detail: string;
}

const violations: Violation[] = [];
const yearHits: Array<{ file: string; line: number; text: string }> = [];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = new Date();

// ── Rule 1 + 2 — entry integrity and staleness ───────────────────────────────
const seenIds = new Set<string>();

for (const entry of REGULATORY_ENTRIES) {
  const at = `entry "${entry.id || "(no id)"}"`;

  if (!entry.id || !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(entry.id)) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "id must be a dotted lower-case slug, e.g. asbestos.presumption-year.au",
    });
  }
  if (seenIds.has(entry.id)) {
    violations.push({ rule: "entry-integrity", where: at, detail: "duplicate id" });
  }
  seenIds.add(entry.id);

  if (!entry.instrument?.trim()) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "no instrument — name the Act, Regulation, Code or Standard",
    });
  }
  if (!entry.requirement?.trim() || entry.requirement.trim().length < 40) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "requirement missing or too short to be usable in a document",
    });
  }
  if (!entry.sourceUrl || !/^https:\/\//.test(entry.sourceUrl)) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "sourceUrl missing or not https — an unsourced regulation may not ship",
    });
  }
  if (!ISO_DATE.test(entry.effectiveFrom ?? "")) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "effectiveFrom must be an ISO date (YYYY-MM-DD)",
    });
  }
  if (!VERIFICATION_KINDS.includes(entry.verification)) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: `verification must be one of ${VERIFICATION_KINDS.join(", ")}`,
    });
  }

  if (!ISO_DATE.test(entry.verifiedAt ?? "")) {
    violations.push({
      rule: "entry-integrity",
      where: at,
      detail: "verifiedAt must be an ISO date — an unchecked regulation may not ship",
    });
  } else {
    const verified = new Date(`${entry.verifiedAt}T00:00:00Z`);
    const ageDays = Math.floor(
      (today.getTime() - verified.getTime()) / 86_400_000,
    );
    if (ageDays < 0) {
      violations.push({
        rule: "entry-integrity",
        where: at,
        detail: `verifiedAt is in the future (${entry.verifiedAt})`,
      });
    } else if (ageDays > MAX_VERIFIED_AGE_DAYS) {
      violations.push({
        rule: "staleness",
        where: at,
        detail: `last verified ${ageDays} days ago (${entry.verifiedAt}); re-check against ${entry.sourceUrl} and update verifiedAt`,
      });
    }
  }
}

// ── Walk the tree once for rules 3 and 4 ─────────────────────────────────────
const knownIds = new Set(regulatoryIds());

function walk(dir: string, visit: (file: string, text: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (SKIP_DIR.test(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, visit);
    else if (SCAN_EXT.test(name)) visit(full, readFileSync(full, "utf8"));
  }
}

for (const root of SCAN_ROOTS) {
  walk(root, (file, text) => {
    const inRegistry = file.startsWith(REGISTRY_DIR);

    const lines = text.split("\n");

    /** Does a regulatory keyword sit within KEYWORD_WINDOW lines of this one? */
    const nearKeyword = (i: number): boolean =>
      lines
        .slice(Math.max(0, i - KEYWORD_WINDOW), i + KEYWORD_WINDOW + 1)
        .some((l) => REGULATORY_KEYWORD.test(l));

    lines.forEach((line, i) => {
      if (line.includes(IGNORE)) return;
      const at = `${file}:${i + 1}`;

      // Rule 3 — regulation("id") naming something the registry does not hold.
      for (const m of line.matchAll(/\bregulation\(\s*["'`]([^"'`]+)["'`]/g)) {
        if (!knownIds.has(m[1])) {
          violations.push({
            rule: "unknown-reference",
            where: at,
            detail: `cites "${m[1]}", which is not in the registry`,
          });
        }
      }

      // Rule 4 — a year threshold next to a regulatory keyword, outside the
      // registry. This is the shape of the original defect. Counted per file
      // and compared against the baseline below.
      if (!inRegistry && YEAR_CLAIM.test(line) && nearKeyword(i)) {
        yearHits.push({ file, line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  });
}

// ── Rule 4 — compare per-file counts against the baseline ────────────────────
const counts = new Map<string, number>();
for (const hit of yearHits) {
  counts.set(hit.file, (counts.get(hit.file) ?? 0) + 1);
}

if (MODE === "update") {
  const files = Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note: "Lines asserting a regulatory year outside lib/compliance/regulatory-registry/. Ratchet DOWN by moving each into the registry; never up.",
        total: yearHits.length,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `check:regulatory-registry - baseline updated: ${yearHits.length} hard-coded regulatory year(s) across ${counts.size} file(s) -> ${BASELINE_PATH}`,
  );
  process.exit(0);
}

const baseline = loadBaseline();
for (const [file, count] of counts) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) {
    for (const hit of yearHits.filter((h) => h.file === file).slice(allowed)) {
      violations.push({
        rule: "hard-coded-year",
        where: `${hit.file}:${hit.line}`,
        detail: `asserts a regulatory year outside the registry (${count} in this file, baseline ${allowed}): ${hit.text}`,
      });
    }
  }
}

// A file that dropped below its baseline should tighten it, so the ratchet only
// ever turns one way.
const loosened = [...Object.entries(baseline)].filter(
  ([file, allowed]) => (counts.get(file) ?? 0) < allowed,
);

// ── Report ───────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log(
    `check:regulatory-registry - OK. ${REGULATORY_ENTRIES.length} entries, all sourced and verified within ${MAX_VERIFIED_AGE_DAYS} days. ${yearHits.length} hard-coded regulatory year(s) remain outside the registry (baselined, ratcheting down).`,
  );
  if (loosened.length > 0) {
    console.log(
      `  ${loosened.length} file(s) now carry fewer than their baseline — run --update-baseline to tighten it.`,
    );
  }
  process.exit(0);
}

console.error(
  `check:regulatory-registry - FAILED with ${violations.length} violation(s).\n`,
);
for (const v of violations) {
  console.error(`  [${v.rule}] ${v.where}\n      ${v.detail}\n`);
}
console.error(
  "A regulation must carry its instrument, an https source and a verifiedAt date,\n" +
    "and must live in lib/compliance/regulatory-registry/ rather than in a string.\n" +
    `Add \`${IGNORE}\` to a line that documents a past mistake rather than asserting a rule.`,
);
process.exit(1);
