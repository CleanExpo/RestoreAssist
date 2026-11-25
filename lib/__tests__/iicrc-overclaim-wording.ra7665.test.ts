/**
 * RA-7665 / RA-8282 / RA-8511: RestoreAssist is aligned to the IICRC
 * standards. It is not certified against them, and nothing it generates is
 * "compliant" with them. lib/iicrc-inclusion-check.ts sets the same rule for
 * reviewer prompts: never assert "complies", "certifies" or "meets [the
 * standard]".
 *
 * This guard scans the code that reaches a customer or an insurer (app/,
 * components/, lib/, mobile/app, mobile/lib, mobile/components, public/ and
 * the store listing) and fails on any compliance claim tied to an IICRC
 * standard, for example "IICRC S500 Compliant", "Compliant with IICRC
 * S500:2021", "S500 compliant questions" or "IICRC-compliant report".
 *
 * House form of words: cite the standard nominatively ("aligned to ANSI/IICRC
 * S500", "references ANSI/IICRC S520"), with the edition taken from
 * standardCite() / standardDesignation() / applicableStandard() in
 * lib/nir-standards-mapping.ts, never hand-typed.
 *
 * Comments are scanned too, because comments get copied into UI strings.
 * A line that has to quote the banned wording (a comment recording an earlier
 * fix) carries the marker `iicrc-wording-ignore`.
 *
 * Tests are skipped, because they quote the old strings on purpose.
 * Whitespace is collapsed per line window, so a phrase split across two JSX
 * lines is still caught.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ROOTS = [
  "app",
  "components",
  "lib",
  "public",
  "mobile/app",
  "mobile/lib",
  "mobile/components",
  "mobile/fastlane",
];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "__tests__",
  "__mocks__",
  "dist",
]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|txt|md|mdx|html)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;
const IGNORE_MARKER = "iicrc-wording-ignore";

// A standard token: IICRC, or an IICRC S-number (S100, S500, S520, S540, S700).
const STD = String.raw`(?:\bIICRC\b|\bS(?:100|500|520|540|700)\b)`;
// Up to 30 characters between the standard and the claim, never crossing a
// sentence end, a list comma, a tag boundary or a string quote, so "IICRC.
// Compliance team" and "IICRC, WHS, or any other compliance" are not read as
// one phrase. A dot between digits ("§11.4") is not a sentence end.
const GAP = String.raw`(?:[^.,!?;\n"'\`<>{}|]|\.(?=\d)){0,30}?`;
// A next line that starts a new list item is a new phrase, not a continuation.
const LIST_ITEM = /^(?:[-*•]|\d+\.)\s/;

/**
 * Overclaim patterns. Each is case-insensitive and matched against one line
 * joined with the next line (whitespace collapsed).
 */
export const OVERCLAIM_PATTERNS: readonly RegExp[] = [
  // "IICRC S500 Compliant", "S500:2021-compliant", "IICRC S500 §11.4 compliant",
  // "IICRC-compliant", "IICRC S500 compliance report"
  new RegExp(`${STD}${GAP}[\\s-]compli(?:ant|ance)\\b`, "i"),
  // "Compliant with IICRC S500:2021", "complies with the S500"
  new RegExp(
    String.raw`\bcompli(?:ant|ance|es)\s+(?:with|to)\s+(?:the\s+)?(?:ANSI\/|AS-)?${STD}`,
    "i",
  ),
  // "certified to S500", "certified against the IICRC S500"
  new RegExp(
    String.raw`\bcertified\s+(?:to|against|under)\s+(?:the\s+)?(?:ANSI\/|AS-)?${STD}`,
    "i",
  ),
];

export function findOverclaims(text: string): string[] {
  const lines = text.split("\n");
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(IGNORE_MARKER)) continue;
    const next = lines[i + 1] ?? "";
    const window =
      next.includes(IGNORE_MARKER) || LIST_ITEM.test(next.trim())
        ? line
        : `${line} ${next.trim()}`;
    const flat = window.replace(/\s+/g, " ");
    for (const re of OVERCLAIM_PATTERNS) {
      const m = flat.match(re);
      // Only report a match that starts on this line, so a phrase split over
      // two lines is reported once.
      if (m && m.index !== undefined && m.index < line.replace(/\s+/g, " ").length) {
        hits.push(`${i + 1}: ${m[0]}`);
        break;
      }
    }
  }
  return hits;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (EXT.test(name) && !TEST_FILE.test(name)) {
      out.push(full);
    }
  }
}

describe("findOverclaims (falsification: the old wording must fail)", () => {
  const OLD_WORDING = [
    "IICRC S500 Compliant",
    "Compliant with IICRC S500:2021 | Australian Water Damage Restoration Standard",
    "S500 compliant reports",
    "S500 compliant questions",
    "IICRC S500 Compliant Drying",
    'title="Download IICRC S500:2021 compliant PDF"',
    "Download the complete IICRC S500:2021 compliant report for your",
    "IICRC S500:2021 compliant inspection photos.",
    "IICRC S500:2021 Compliant Inspection Report",
    "Drying Goal: ACHIEVED — IICRC S500 §11.4 compliant",
    "Start one to generate your first IICRC-compliant report.",
    "Log S500:2021-compliant moisture data across affected areas",
    "All plans include IICRC S500 compliance and professional",
    "AI-Enhanced Report • ANSI/IICRC S500:2021 Compliant • Queensland NCC",
    "complies with the ANSI/IICRC S500",
    "certified to IICRC S520",
    // split across JSX lines
    "<span>IICRC S500\n            Compliant</span>",
  ];
  for (const s of OLD_WORDING) {
    it(`flags: ${JSON.stringify(s)}`, () => {
      expect(findOverclaims(s).length).toBeGreaterThan(0);
    });
  }

  const HOUSE_WORDING = [
    "Aligned to ANSI/IICRC S500",
    "References ANSI/IICRC S500-2021 | Australian water damage restoration",
    "Download the PDF report (references S500:2021)",
    "IICRC Certified Technician",
    "Review prompt: consider whether the IICRC S500 drying goal was recorded",
    "nrpgCompliant: true",
    "s500ComplianceNotes: string;",
    "IICRC CEC Accredited",
    "Do NOT invent IICRC, AS/NZS, WHS, or any other compliance references",
    "- Thermal images per IICRC standards\n    - Compliance documentation",
    '// NOT "IICRC S500 compliant". iicrc-wording-ignore',
  ];
  for (const s of HOUSE_WORDING) {
    it(`allows: ${JSON.stringify(s)}`, () => {
      expect(findOverclaims(s)).toEqual([]);
    });
  }
});

describe("shipped source carries no IICRC compliance overclaim (RA-7665)", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(join(ROOT, r), files);

  it("scans a non-trivial corpus (a guard that scans nothing is not a pass)", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(
      files.some((f) => f.endsWith(join("lib", "generate-iicrc-report-pdf.ts"))),
    ).toBe(true);
  });

  it("finds no overclaim outside tests", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const hits = findOverclaims(readFileSync(f, "utf8"));
      for (const h of hits) offenders.push(`${relative(ROOT, f)}:${h}`);
    }
    expect(offenders).toEqual([]);
  });
});
