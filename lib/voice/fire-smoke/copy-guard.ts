/**
 * Guard against standards text leaking into what Margot says or the screen
 * shows. Citations belong only in sources.ts; spoken and shown copy is our
 * own paraphrase. The repo's check:no-verbatim script is disabled, so this
 * is the working control (engineering.md, test oracle).
 */

const STANDARD_REFERENCE =
  /\b(?:iicrc|ansi|s\s?500|s\s?520|s\s?700|as\s?\/?\s?nzs|as-iicrc|standards australia)\b/i;
// Double quotes only: apostrophes in "I'm" and "didn't" are not quotations.
const QUOTED_PASSAGE = /["“”]([^"“”]{0,400})["“”]/g;
const MAX_QUOTED_WORDS = 8;
export const MAX_SPOKEN_WORDS = 70;

export interface CopyViolation {
  text: string;
  rule: "standard_reference" | "quoted_passage" | "too_long";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function findStandardsTextViolations(strings: readonly string[]): CopyViolation[] {
  const violations: CopyViolation[] = [];
  for (const text of strings) {
    if (STANDARD_REFERENCE.test(text)) {
      violations.push({ text, rule: "standard_reference" });
    }
    for (const match of text.matchAll(QUOTED_PASSAGE)) {
      if (wordCount(match[1]) > MAX_QUOTED_WORDS) {
        violations.push({ text, rule: "quoted_passage" });
        break;
      }
    }
    if (wordCount(text) > MAX_SPOKEN_WORDS) {
      violations.push({ text, rule: "too_long" });
    }
  }
  return violations;
}
