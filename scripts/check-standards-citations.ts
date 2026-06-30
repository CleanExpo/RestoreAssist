/**
 * Standards-citation staleness gate (STORM #7).
 *
 * Fails if any source file hard-codes an IICRC `S###:YYYY` citation whose year
 * disagrees with the canonical registry in lib/nir-standards-mapping.ts. This
 * stops fabricated/stale editions (e.g. the old "S500:2025") from creeping back. standards-cite-ignore
 *
 * Allowed editions are read FROM the registry, so updating an edition there is
 * the only place a year needs to change. Add `standards-cite-ignore` on a line
 * to exempt an intentional literal (e.g. a comment documenting a past mistake).
 *
 * Run: pnpm tsx scripts/check-standards-citations.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STANDARDS_VERSIONS } from "../lib/nir-standards-mapping";

const ROOTS = ["lib", "app", "components", "scripts"];
const EXT = /\.(ts|tsx)$/;
const CITE = /\bS(100|500|520|540|700):(\d{4})\b/gi;
const IGNORE = "standards-cite-ignore";

const expectedYear: Record<string, number> = {};
for (const [key, v] of Object.entries(STANDARDS_VERSIONS)) {
  expectedYear[key] = v.year;
}

type Violation = { file: string; line: number; found: string; expected: string };
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
  });
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch {
    // root may not exist in some checkouts — skip
  }
}

if (violations.length > 0) {
  console.error(
    `\n✖ ${violations.length} stale IICRC citation(s) — they disagree with STANDARDS_VERSIONS:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.found}  → should be ${v.expected}`);
  }
  console.error(
    `\nFix the literal, derive it via standardCite(), or add "${IGNORE}" if intentional.\n`,
  );
  process.exit(1);
}

console.log("✓ All IICRC S###:YYYY citations match STANDARDS_VERSIONS.");
