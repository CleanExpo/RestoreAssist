/**
 * RA-6934 — a report must not invent IICRC clause numbers when the standards
 * documents were never retrieved.
 *
 * lib/standards-retrieval.ts:47-53 states the risk plainly: when standards cannot
 * be grounded from the Drive folder, "the report free-generates IICRC content from
 * general knowledge". That is the NORMAL state in production — the folder is not
 * readable by the app's Drive identity and the service-account credentials are
 * unset — so this is not a corner case.
 *
 * The prompt demands IICRC citations unconditionally: a required "IICRC Water
 * Damage Standards" subsection, "Reference IICRC S500:2021 and S520 standards
 * explicitly", and a certification line asserting compliance. None of that is
 * conditioned on retrieval having succeeded. An existing "do not invent clause
 * numbers" instruction exists but only on four material-specific bullets.
 *
 * The signal that matters is simply whether standards text is present in this
 * prompt. `standardsContext` is "" exactly then — buildStandardsContextPrompt
 * returns "" when documents is empty — so no extra plumbing is needed.
 *
 * Edition-level citation stays permitted: STANDARDS_VERSIONS is verified against
 * the publisher and needs no document. Only SECTION-level citation requires the
 * document that is missing.
 */
import { describe, it, expect } from "vitest";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";

const base = {
  report: { id: "r1", propertyAddress: "1 Test St" },
  analysis: {},
  tier1: {},
  tier2: {},
  tier3: {},
  stateInfo: null,
  reportType: "inspection",
};

describe("standards grounding guard", () => {
  it("forbids section-level citation when no standards text is in the prompt", () => {
    const prompt = buildInspectionReportPrompt({ ...base });
    expect(prompt).toMatch(/STANDARDS (WERE )?NOT (GROUNDED|RETRIEVED)/i);
    expect(prompt).toMatch(/do NOT cite section|clause or paragraph numbers/i);
  });

  it("still permits citing a standard by designation and edition", () => {
    const prompt = buildInspectionReportPrompt({ ...base });
    expect(prompt).toMatch(/designation and edition/i);
  });

  it("does not emit the ungrounded warning when standards WERE retrieved", () => {
    const prompt = buildInspectionReportPrompt({
      ...base,
      standardsContext: "S500 §10.4 Category of Water — retrieved text here",
    });
    expect(prompt).not.toMatch(/STANDARDS NOT GROUNDED/i);
    // and the existing must-cite instruction still fires
    expect(prompt).toMatch(/You MUST reference and cite specific sections/);
  });
});
