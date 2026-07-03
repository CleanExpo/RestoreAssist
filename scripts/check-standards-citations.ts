/**
 * Standards-citation integrity gate (STORM #7).
 *
 * Three deterministic checks, all fed from the canonical registries so there is
 * a single place to update an edition or add a section:
 *
 *   1. STALE EDITION (source literals) — fails if any .ts/.tsx file hard-codes an
 *      IICRC `S###:YYYY` citation whose year disagrees with STANDARDS_VERSIONS in
 *      lib/nir-standards-mapping.ts. Stops fabricated/stale editions (e.g. the old
 *      "S500:2025") from creeping back into code. standards-cite-ignore
 *
 *   2. STALE EDITION (JSON corpus) — fails if any object in scripts/data/*.json
 *      carries an `edition` year that disagrees with STANDARDS_VERSIONS for the
 *      standard it names (e.g. an IICRC_S500 entry stamped "2025"). Only standards
 *      present in the registry are validated; others (AS/NZS, NZBS, NADCA) are left
 *      alone because RestoreAssist does not pin their editions centrally.
 *
 *   3. FABRICATED SECTION (source literals) — fails if any `S500:YYYY §N.x` citation
 *      names a top-level section N that does not exist in the verified S500 section
 *      index (lib/standards/s500-sections.ts). This is the known fabrication class:
 *      invented chapter numbers attached to equipment/drying content. Sub-section
 *      depth is NOT required to be listed (the index is a partial ToC) — only the
 *      top-level chapter must be real.
 *
 * Allowed editions/sections are read FROM the registries, so those files are the
 * only place a change is needed. Add `standards-cite-ignore` on a line to exempt an
 * intentional literal (e.g. a comment documenting a past mistake).
 *
 * Run: pnpm tsx scripts/check-standards-citations.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STANDARDS_VERSIONS } from "../lib/nir-standards-mapping";
import { S500_SECTIONS } from "../lib/standards/s500-sections";

const ROOTS = ["lib", "app", "components", "scripts", "types"];
const EXT = /\.(ts|tsx)$/;
const CITE = /\bS(100|500|520|540|700):(\d{4})\b/gi;
const S500_SEC = /\bS500:\d{4}\s*§\s*(\d+)(?:\.\d+)*/gi;
const IGNORE = "standards-cite-ignore";

const expectedYear: Record<string, number> = {};
for (const [key, v] of Object.entries(STANDARDS_VERSIONS)) {
  expectedYear[key] = v.year;
}

// Top-level S500 chapter numbers that actually exist (e.g. "1".."16").
const S500_TOP_LEVELS = new Set(
  Object.keys(S500_SECTIONS).map((k) => k.split(".")[0]),
);

type Violation = { file: string; line: number | null; found: string; expected: string };
const violations: Violation[] = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXT.test(entry)) scan(full);
  }
}

function scan(file: string): void {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(IGNORE)) return;

    // Check 1 — stale edition literals.
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

    // Check 3 — fabricated S500 top-level section.
    for (const m of line.matchAll(S500_SEC)) {
      const top = m[1];
      if (!S500_TOP_LEVELS.has(top)) {
        violations.push({
          file,
          line: i + 1,
          found: m[0],
          expected: `an S500 section whose top-level chapter exists in lib/standards/s500-sections.ts (§${top} does not)`,
        });
      }
    }
  });
}

/**
 * Check 2 — JSON corpus edition fields. Maps `IICRC_S500` → registry key `S500`
 * and validates the `edition` year. Standards absent from the registry are skipped.
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

for (const root of ROOTS) {
  try {
    walk(root);
  } catch {
    // root may not exist in some checkouts — skip
  }
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
  "✓ All IICRC citations match STANDARDS_VERSIONS and reference real S500 sections.",
);
