/**
 * UNI-2619 — the WHS citation must reach the prompt verbatim, in every jurisdiction.
 *
 * `buildVisualCentricReportPrompt` used to render the WHS line as:
 *
 *     - Work Health and Safety Act ${stateInfo.whsAct.split(" ").pop()}
 *
 * `.split(" ").pop()` returns the LAST space-delimited token, which in all eight
 * `getStateInfo` entries is the bracketed jurisdiction code, never the year. So
 * every jurisdiction lost its year, and Victoria — whose stored citation is the
 * Occupational Health and Safety Act 2004, because Victoria never adopted the
 * model WHS laws — was rendered under a "Work Health and Safety Act (Vic)" that
 * does not exist.
 *
 * Both prompt builders are covered:
 *   - reportType "basic"  -> buildVisualCentricReportPrompt (where the bug was)
 *   - reportType "mould"  -> buildInspectionReportPrompt    (already correct)
 *
 * The jurisdiction list is asserted against `getStateInfo` itself, so adding a
 * jurisdiction to state-detection cannot silently escape this check.
 */
import { describe, expect, it } from "vitest";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { getStateInfo } from "@/lib/state-detection";

const JURISDICTIONS = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"] as const;

/** "basic" delegates to buildVisualCentricReportPrompt; anything else does not. */
const BUILDERS = [
  { label: "visual-centric (basic)", reportType: "basic", marker: "STATE COMPLIANCE & STANDARDS" },
  { label: "inspection (mould)", reportType: "mould", marker: "State Regulatory Framework" },
] as const;

function promptFor(stateCode: string, reportType: string): string {
  return buildInspectionReportPrompt({
    report: { propertyAddress: "1 Test St", reportNumber: "TEST-1" },
    analysis: {},
    tier1: {},
    tier2: {},
    tier3: {},
    stateInfo: getStateInfo(stateCode),
    reportType,
  });
}

describe("WHS citation reaches the prompt verbatim (UNI-2619)", () => {
  it("every jurisdiction in the table resolves in state-detection", () => {
    // Guards the table itself: a jurisdiction added to state-detection but not
    // here fails loudly rather than quietly going untested.
    for (const code of JURISDICTIONS) {
      expect(getStateInfo(code), `getStateInfo("${code}") returned null`).toBeTruthy();
    }
  });

  describe.each(BUILDERS)("$label", ({ reportType, marker }) => {
    it.each(JURISDICTIONS)(
      "%s: stored citation appears in full, year included",
      (code) => {
        const stored = getStateInfo(code)!.whsAct;
        const prompt = promptFor(code, reportType);

        // Positive control: prove the prompt was really built and carries the
        // section these assertions depend on. Without it, a builder returning
        // "" would satisfy every negative assertion below.
        expect(prompt).toContain(marker);

        expect(prompt).toContain(stored);

        // The year is exactly what `.split(" ").pop()` silently dropped.
        const year = stored.match(/\b(?:19|20)\d{2}\b/)?.[0];
        expect(year, `no year in stored citation for ${code}`).toBeDefined();
        expect(prompt).toContain(year!);
      },
    );

    it("no jurisdiction renders an Act with a bracketed code where the year belongs", () => {
      // The exact shape the old interpolation produced.
      for (const code of JURISDICTIONS) {
        expect(
          promptFor(code, reportType),
          `${code} rendered an Act with no year`,
        ).not.toMatch(
          /Work Health and Safety Act \((?:Qld|NSW|Vic|SA|WA|Tas|ACT|NT)\)/,
        );
      }
    });

    it("VICTORIA cites the Occupational Health and Safety Act 2004, never a WHS Act", () => {
      const prompt = promptFor("VIC", reportType);

      expect(prompt).toContain("Occupational Health and Safety Act 2004 (Vic)");

      // Victoria has no Work Health and Safety Act at all. Neither the mangled
      // form nor a plausible-looking dated one may appear.
      expect(prompt).not.toMatch(/Work Health and Safety Act \(Vic\)/);
      expect(prompt).not.toMatch(/Work Health and Safety Act \d{4} \(Vic\)/);
    });
  });
});
