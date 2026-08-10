/**
 * Plan-quantity copy guard.
 *
 * WHY THIS EXISTS, AND WHY `pricing-integrity.test.ts` DID NOT CATCH IT.
 *
 * That guard opens by stating its own scope: "The public pricing page renders
 * from `PRICING_CONFIG`, so drift can only creep in via config edits". That
 * assumption is false, and this is the defect that disproved it —
 * `components/InitialDataEntryForm.tsx` told trial users "Free plan allows 3
 * Basic reports only" while `PRICING_CONFIG.free.trialReportCredits` granted
 * 50. Nothing in the config was wrong, so a config-scoped guard could not fire.
 *
 * The failure surface is not the config. It is any string, anywhere in the
 * product, that states how many reports a free user gets. That is what this
 * scans.
 *
 * SCOPE, stated plainly so a future reader knows what a green here does and
 * does not prove: it walks `app/` and `components/` source and matches copy
 * that names a report quantity in a free-or-trial context. It will NOT catch a
 * quantity assembled at runtime from variables, one written in words ("three
 * reports"), or one living outside those two directories. A green means no
 * literal disagrees — not that no disagreement exists.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

const repoRoot = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"];
const SKIP = new Set(["node_modules", "__tests__", ".next", "dist"]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * A report count stated in a free-or-trial context.
 *
 * Anchored on "free plan" / "free trial" / "trial" so that a paid-tier count
 * ("50 reports per month") is not dragged in, and bounded to a short window so
 * an unrelated number later in the same string cannot match.
 */
const CLAIM = /(?:free plan|free trial|trial)([^"'`\n]{0,60}?)\b(\d{1,3})\b([^"'`\n]{0,20}?)report/gi;

/**
 * Two shapes the first draft of this scanner matched and should not have. Both
 * were found by running it, not by imagining them — worth keeping named so the
 * next person widening the regex knows what it has to keep excluding.
 *
 *  - A standard version read as a count: "a fully S500:2021-mapped report"
 *    matched "2021". Bounded the count to 1-3 digits and reject a preceding
 *    colon or hyphen.
 *  - A runtime value read as a literal: "${data?.creditsRemaining ?? 0} report"
 *    matched the fallback "0". This scanner explicitly does not cover
 *    quantities assembled at runtime, so an interpolation is out of scope
 *    rather than a violation.
 */
function isFalsePositive(before: string, after: string): boolean {
  if (/[:-]\s*$/.test(before)) return true;
  return before.includes("${") || after.includes("${");
}

/**
 * Drop whole-line comments before scanning.
 *
 * Found by running this guard: after the offending toast was fixed, it went red
 * again on the COMMENT explaining the fix, because that comment quotes the old
 * copy verbatim. The failure surface is strings the product ships, not prose
 * about strings it used to ship — otherwise every changelog note about a copy
 * bug re-triggers the bug.
 *
 * Deliberately only whole-line comments. Stripping trailing `//` from a code
 * line would eat the rest of any line containing a URL inside a string literal,
 * which could silently hide a real violation — a false negative, the direction
 * that actually matters for a guard.
 */
function stripCommentLines(src: string): string {
  return src
    .split("\n")
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? "" : line))
    .join("\n");
}

describe("plan-quantity copy matches the actual grant", () => {
  it("no free-tier report count in app/ or components/ disagrees with PRICING_CONFIG", () => {
    const granted = PRICING_CONFIG.free.trialReportCredits;
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(join(repoRoot, dir))) {
        const src = stripCommentLines(readFileSync(file, "utf8"));
        for (const match of src.matchAll(CLAIM)) {
          const [, before = "", digits = "", after = ""] = match;
          if (isFalsePositive(before, after)) continue;
          const stated = Number(digits);
          if (stated === granted) continue;
          const line = src.slice(0, match.index ?? 0).split("\n").length;
          offenders.push(
            `${file.replace(`${repoRoot}/`, "")}:${line} states ${stated} reports, grant is ${granted} — ${match[0].trim()}`,
          );
        }
      }
    }

    expect(
      offenders,
      `copy states a free-tier report count that disagrees with PRICING_CONFIG.free.trialReportCredits (${granted}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the scanner can actually see a disagreement (negative control)", () => {
    // Proves the regex fires. Without this, an empty offenders list above is
    // indistinguishable from a pattern that matches nothing at all — the exact
    // way a guard passes forever while covering nothing.
    const planted = 'toast.error("Free plan allows 3 Basic reports only.")';
    const hits = [...planted.matchAll(CLAIM)].map((m) => Number(m[2]));
    expect(hits).toContain(3);
    expect(hits).not.toContain(PRICING_CONFIG.free.trialReportCredits);

    // And prove the false-positive filter does not swallow a real violation —
    // a filter that rejects everything would make the scan silently vacuous.
    expect(isFalsePositive(" allows ", " Basic ")).toBe(false);
    expect(isFalsePositive(" and produce a fully S500:", "-mapped ")).toBe(true);
    expect(isFalsePositive(" includes ${data?.creditsRemaining ?? ", "} ")).toBe(true);
  });
});
