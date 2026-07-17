/**
 * Standards-citation integrity gate (STORM #7, hardened RA-7001).
 *
 * Deterministic checks, all fed from the canonical registries so there is a
 * single place to update an edition or add a section:
 *
 *   1. STALE EDITION (source + content literals) — fails if any scanned file
 *      hard-codes an IICRC `S###:YYYY` OR `S###-YYYY` citation whose year
 *      disagrees with STANDARDS_VERSIONS in lib/nir-standards-mapping.ts. Stops
 *      fabricated/stale editions (e.g. the old "S500:2025" / "S520:2023" — standards-cite-ignore)
 *      from creeping back into code OR the JSON content corpus.
 *
 *   2. STALE EDITION (structured JSON corpus) — fails if any object in
 *      scripts/data/*.json carries an `edition` year that disagrees with
 *      STANDARDS_VERSIONS for the standard it names.
 *
 *   3. FABRICATED S500 SECTION — fails if any `S500:YYYY §N…` citation names a
 *      top-level chapter that does not exist in the verified S500 section index
 *      (lib/standards/s500-sections.ts), OR names a subsection that does not
 *      exist WITHIN a fully-transcribed subtree. The S500 index is a PARTIAL
 *      table of contents, so subsection depth is only enforced under the subtrees
 *      listed in S500_COMPLETE_SUBTREES (whose child lists are complete — verified
 *      from the owner's per-chapter PDFs). This catches the known fabrication
 *      class — e.g. §9.3.2 and §10.5.4 — without rejecting real-but-unlisted
 *      subsections elsewhere.
 *
 *   4. FABRICATED S700 CHAPTER — fails if any `S700:YYYY §N…` citation names a
 *      top-level chapter outside 1–11 (the published ANSI/IICRC S700:2025 index;
 *      verified from the owner's licensed S700:2025 document). Subsection depth is
 *      NOT yet enforced for S700 — TODO(RA-7001): add an S700 subsection SSOT and
 *      enforce depth the way S500 does.
 *
 * Editions/sections are read FROM the registries, so those files are the only
 * place a change is needed. Add `standards-cite-ignore` on a line to exempt an
 * intentional literal (e.g. a comment documenting a past mistake).
 *
 * NOT enforced (deliberately): S520/S540/S100 subsection depth (no central
 * subsection SSOT), and S760 (a draft, unpublished IICRC wildfire standard —
 * RestoreAssist does not and should not cite it).
 *
 * Run: pnpm tsx scripts/check-standards-citations.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STANDARDS_VERSIONS } from "../lib/nir-standards-mapping";
import { S500_SECTIONS } from "../lib/standards/s500-sections";

const ROOTS = [
  "lib",
  "app",
  "components",
  "scripts",
  "types",
  "data/content",
  "prisma",
  "mobile",
  "__tests__",
  "docs",
  "distribution",
  "PROJECTS",
];
// Code + prose + content files that can carry a citation. `.sql` is excluded on
// purpose: applied migrations under prisma/migrations are immutable (editing them
// breaks Prisma's checksum), so that directory is skipped entirely (see walk()).
const EXT = /\.(ts|tsx|md|mdx|json|jsonl|txt|toml|prisma)$/;
// Accept both `S###:YYYY` and the formal `S###-YYYY` designation form.
const CITE = /\bS(100|500|520|540|700)[-:](\d{4})\b/gi;
// Capture the FULL dotted section number so subsection depth can be validated.
const S500_SEC = /\bS500[-:]\d{4}\s*§\s*(\d+(?:\.\d+)*)/gi;
const S700_SEC = /\bS700[-:]\d{4}\s*§\s*(\d+)(?:\.\d+)*/gi;
const IGNORE = "standards-cite-ignore";

const expectedYear: Record<string, number> = {};
for (const [key, v] of Object.entries(STANDARDS_VERSIONS)) {
  expectedYear[key] = v.year;
}

// Top-level S500 chapter numbers that actually exist (e.g. "1".."16").
const S500_TOP_LEVELS = new Set(
  Object.keys(S500_SECTIONS).map((k) => k.split(".")[0]),
);

// S500 subtrees whose child list in s500-sections.ts is COMPLETE (verified from
// the owner's per-chapter PDFs). A citation that descends from one of these but
// is not itself a key in S500_SECTIONS is fabricated. §10.4 (Category/Class
// definitions), §10.5 (Initial Contact — has NO numbered subsections), and §9.3
// (Risk Management — has NO numbered subsections) are the known fabrication sites.
const S500_COMPLETE_SUBTREES = ["10.4", "10.5", "9.3"];

// Published ANSI/IICRC S700:2025 top-level chapters (1–11), verified from the
// owner's licensed S700:2025 document.
const S700_TOP_LEVELS = new Set([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
]);

type Violation = { file: string; line: number | null; found: string; expected: string };
const violations: Violation[] = [];

function isFabricatedS500Section(sec: string): string | null {
  const top = sec.split(".")[0];
  if (!S500_TOP_LEVELS.has(top)) {
    return `an S500 section whose top-level chapter exists in lib/standards/s500-sections.ts (§${top} does not)`;
  }
  for (const prefix of S500_COMPLETE_SUBTREES) {
    if (sec === prefix) return null;
    if (sec.startsWith(`${prefix}.`) && !(sec in S500_SECTIONS)) {
      return `a real S500 subsection — §${sec} is not in the fully-transcribed §${prefix} subtree (lib/standards/s500-sections.ts)`;
    }
  }
  return null;
}

function scanText(file: string, text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes(IGNORE)) return;

    // Check 1 — stale edition literals (`:` or `-` form).
    for (const m of line.matchAll(CITE)) {
      const [literal, std, year] = m;
      const want = expectedYear[`S${std}`];
      if (want !== undefined && Number(year) !== want) {
        violations.push({
          file,
          line: i + 1,
          found: literal,
          expected: `S${std}:${want}`,
        });
      }
    }

    // Check 3 — fabricated S500 chapter or subsection.
    for (const m of line.matchAll(S500_SEC)) {
      const problem = isFabricatedS500Section(m[1]);
      if (problem) {
        violations.push({ file, line: i + 1, found: `§${m[1]}`, expected: problem });
      }
    }

    // Check 4 — fabricated S700 chapter.
    for (const m of line.matchAll(S700_SEC)) {
      if (!S700_TOP_LEVELS.has(m[1])) {
        violations.push({
          file,
          line: i + 1,
          found: `S700 §${m[1]}`,
          expected: "an S700:2025 chapter in 1–11 (published index)",
        });
      }
    }
  });
}

function walk(dir: string, ext: RegExp, onFile: (f: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // root may not exist in some checkouts — skip
  }
  for (const entry of entries) {
    // Skip build/vendor dirs and prisma/migrations (immutable applied SQL — its
    // inert historical comments must not fail or be edited).
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === "migrations"
    )
      continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, ext, onFile);
    else if (ext.test(entry)) onFile(full);
  }
}

/**
 * Check 2 — structured JSON corpus edition fields. Maps `IICRC_S500` → registry
 * key `S500` and validates the `edition` year. Standards absent from the registry
 * are skipped.
 */
function scanJsonEditions(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const file = join(dir, entry);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue; // not our concern — build/tsc will flag malformed JSON
    }
    if (!Array.isArray(parsed)) continue;
    parsed.forEach((row, idx) => {
      if (row === null || typeof row !== "object") return;
      const std = (row as Record<string, unknown>).standard;
      const edition = (row as Record<string, unknown>).edition;
      if (typeof std !== "string" || typeof edition !== "string") return;
      const registryKey = std.startsWith("IICRC_") ? std.slice("IICRC_".length) : std;
      const want = expectedYear[registryKey];
      if (want === undefined) return; // not centrally pinned — skip
      if (Number(edition) !== want) {
        violations.push({
          file: `${file} [${idx}]`,
          line: null,
          found: `"${std}" edition "${edition}"`,
          expected: `edition "${want}"`,
        });
      }
    });
  }
}

// Literal scan across all roots: code (.ts/.tsx), docs/prose (.md/.mdx/.txt/.toml),
// the Prisma schema (.prisma), and the JSON/JSONL content corpus — edition and
// section citations live inside string fields there, not just structured columns.
for (const root of ROOTS) {
  walk(root, EXT, (f) => scanText(f, readFileSync(f, "utf8")));
}

scanJsonEditions("scripts/data");

if (violations.length > 0) {
  console.error(
    `\n✖ ${violations.length} IICRC citation integrity issue(s):\n`,
  );
  for (const v of violations) {
    const loc = v.line === null ? v.file : `${v.file}:${v.line}`;
    console.error(`  ${loc}  ${v.found}  → ${v.expected}`);
  }
  console.error(
    `\nFix the literal/edition, derive it via standardCite(), or add "${IGNORE}" if intentional.\n`,
  );
  process.exit(1);
}

console.log(
  "✓ All IICRC citations match STANDARDS_VERSIONS and reference real S500/S700 sections.",
);
