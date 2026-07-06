/**
 * Marketing zero-verbatim gate (RA-7000 Phase 2).
 *
 * Marketing copy carries ZERO verbatim tolerance for licensed IICRC/RIA
 * standard text: reference the framework, cite the clause number, never the
 * wording. This gate runs guardStandardOutput in "marketing" mode (6+
 * contiguous-word floor) over the public marketing surfaces, against the same
 * detection fingerprints the repo-wide tripwire uses — so it also catches
 * PARTIAL reuse the exact-substring tripwire (check-no-verbatim-standards.ts)
 * misses.
 *
 * Fingerprints are detection material only (never redistributed content).
 * Expand SOURCE_FINGERPRINTS as more standards are extracted to the private
 * store. scripts/ is outside the tripwire's scan roots, so keeping a local
 * copy here does not trip it.
 *
 * Run: pnpm check:marketing-verbatim
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { guardStandardOutput } from "../lib/standards/copyright-guard";

// Verbatim fingerprint sentences from the licensed standards (same corpus as
// scripts/check-no-verbatim-standards.ts — keep the two lists in sync).
const SOURCE_FINGERPRINTS: string[] = [
  "Mitigation following water damage events should begin as soon as safely possible",
  "establish drying goals that would be expected to inhibit microbial growth and return materials",
];

// Public marketing / outward-facing copy surfaces.
const ROOTS = ["docs/marketing", "remotion/compositions/marketing", "content"];
const EXT = /\.(md|mdx|ts|tsx|json|html)$/;

const failures: { file: string; spans: number; longestRun: number }[] = [];

function walk(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (EXT.test(entry)) scan(full);
  }
}

function scan(file: string): void {
  const text = readFileSync(file, "utf8");
  const result = guardStandardOutput(text, SOURCE_FINGERPRINTS, "marketing");
  if (!result.ok) {
    failures.push({
      file,
      spans: result.violations.length,
      longestRun: result.longestRunWords,
    });
  }
}

for (const root of ROOTS) walk(root);

if (failures.length > 0) {
  console.error(
    "\n✖ Marketing copy reproduces licensed standard text (zero verbatim tolerance):\n",
  );
  for (const f of failures) {
    console.error(
      `  ${f.file}  — ${f.spans} span(s), longest run ${f.longestRun} words`,
    );
  }
  console.error(
    "\nReference the IICRC framework and cite the clause number, but rewrite the wording entirely. Standard text is available only via IICRC/CARSI membership.\n",
  );
  process.exit(1);
}

console.log(
  `✓ Marketing surfaces clean — no verbatim standard text (${ROOTS.join(", ")}).`,
);
