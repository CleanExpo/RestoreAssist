/**
 * Copyright tripwire (Standards KB gate G6).
 *
 * The licensed IICRC/RIA standards' VERBATIM text must live only in the owner's
 * private store (Wiki / Supabase) — never in this application repo. Section keys
 * and short section TITLES are fine (they're facts/citations); copying chapter
 * PROSE in is a licensing violation.
 *
 * This is a tripwire, not an exhaustive detector: it fails CI if any known
 * verbatim canary sentence (taken from the licensed standards) appears in a
 * tracked source/data file. Expand CANARIES as more standards are extracted.
 *
 * Run: pnpm tsx scripts/check-no-verbatim-standards.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Verbatim sentences from the licensed standards. If any appears in the repo,
// chapter prose was pasted in — fail. (Kept short + distinctive; these are
// quoted here only as detection fingerprints, not as redistributed content.)
const CANARIES: string[] = [
  "Mitigation following water damage events should begin as soon as safely possible",
  "establish drying goals that would be expected to inhibit microbial growth and return materials",
];

const ROOTS = ["lib", "app", "components", "data"];
const EXT = /\.(ts|tsx|js|jsx|json|md|mdx)$/;
const SELF = "check-no-verbatim-standards";

const hits: { file: string; canary: string }[] = [];

function walk(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === "dist") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (EXT.test(e) && !full.includes(SELF)) scan(full);
  }
}

function scan(file: string): void {
  const text = readFileSync(file, "utf8");
  for (const c of CANARIES) {
    if (text.includes(c)) hits.push({ file, canary: c });
  }
}

for (const root of ROOTS) walk(root);

if (hits.length > 0) {
  console.error(
    `\n✖ Verbatim licensed standards text found in the app repo (copyright violation):\n`,
  );
  for (const h of hits) {
    console.error(`  ${h.file}  contains: "${h.canary.slice(0, 60)}…"`);
  }
  console.error(
    `\nMove verbatim standard text to the private Wiki/Supabase store. The repo keeps only citation keys + short titles.\n`,
  );
  process.exit(1);
}

console.log("✓ No verbatim licensed standards text in the app repo.");
