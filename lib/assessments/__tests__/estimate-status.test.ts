/**
 * RA-8275 — an unpriced estimate line blocks the total and is never shown
 * or summed as $0. The PDF route and renderers read lines through these
 * helpers.
 */

import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { formatLineMoney, isBlockingLine } from "../estimate-status";
import { generateAssessmentPdf } from "../generate-assessment-pdf";
import type { EstimateLine } from "../types";

const priced: EstimateLine = {
  description: "Call-out Fee",
  category: "ADMIN",
  quantity: 1,
  unit: "ea",
  rate: 151,
  lineTotalExGst: 151,
  gstAmount: 15.1,
  lineTotalIncGst: 166.1,
  pricingStatus: "priced",
};

const rateNotSet: EstimateLine = {
  ...priced,
  description: "Ozone Treatment",
  rate: null,
  lineTotalExGst: null,
  gstAmount: null,
  lineTotalIncGst: null,
  pricingStatus: "rate_not_set",
  pricingNote: "Rate not set. Set rateOzoneGenerator in your price list.",
};

const inLabour: EstimateLine = {
  ...rateNotSet,
  description: "Wall and Ceiling Wash",
  pricingStatus: "included_in_labour",
  pricingNote: undefined,
};

describe("isBlockingLine", () => {
  it("a priced line does not block", () => {
    expect(isBlockingLine(priced)).toBe(false);
  });

  it("a line with no rate blocks", () => {
    expect(isBlockingLine(rateNotSet)).toBe(true);
  });

  it("a legacy line with a null rate and no status blocks", () => {
    const { pricingStatus: _s, ...legacy } = rateNotSet;
    expect(isBlockingLine(legacy as EstimateLine)).toBe(true);
  });

  // RA-8281 review (CodeRabbit): rows stored before RA-8275 priced a missing
  // rate at $0 and carry no pricingStatus. The PDF route re-reads them; they
  // must block the total, not sum as a complete $0 line.
  it("a legacy line priced at $0 with no status blocks", () => {
    const { pricingStatus: _s, ...legacy } = priced;
    const zero = { ...legacy, rate: 0, lineTotalExGst: 0, gstAmount: 0, lineTotalIncGst: 0 };
    expect(isBlockingLine(zero as EstimateLine)).toBe(true);
  });

  it("a legacy line with a real rate and no status does not block", () => {
    const { pricingStatus: _s, ...legacy } = priced;
    expect(isBlockingLine(legacy as EstimateLine)).toBe(false);
  });

  it("a line the contractor priced at $0 on purpose does not block", () => {
    const free = { ...priced, rate: 0, lineTotalExGst: 0, gstAmount: 0, lineTotalIncGst: 0 };
    expect(isBlockingLine(free)).toBe(false);
  });

  it("a line carried by labour hours does not block", () => {
    expect(isBlockingLine(inLabour)).toBe(false);
  });
});

describe("formatLineMoney", () => {
  it("never renders an unpriced line as $0", () => {
    expect(formatLineMoney(null, rateNotSet)).toBe("Not priced");
    expect(formatLineMoney(null, inLabour)).toBe("In labour");
    expect(formatLineMoney(151, priced)).toBe("$151.00");
  });
});

/** Text of every page, so a wrong heading or cell is visible to the test. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    const parts: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) parts.push(item.str);
      }
    }
    return parts.join(" ");
  } finally {
    await task.destroy();
  }
}

describe("generateAssessmentPdf with a blocked total", () => {
  it("states the total is not available and never prints $0.00", async () => {
    const bytes = await generateAssessmentPdf({
      domain: "FIRE_SMOKE",
      report: { sections: [{ heading: "Situation", body: "Protein smoke." }] },
      scope: {
        items: [
          {
            description: "Windows and Tracks Clean",
            category: "MATERIALS",
            quantity: null,
            unit: "window",
            iicrcRef: "S700:2025 §6",
          },
        ],
      },
      estimate: {
        lines: [priced, rateNotSet, inLabour],
        totals: {
          subtotalExGst: null,
          gstTotal: null,
          totalIncGst: null,
          gstRate: 0.1,
          currency: "AUD",
          status: "blocked",
          missing: [{ description: "Ozone Treatment", note: "Rate not set." }],
          basis:
            "Priced from your contractor's own rates, within the NRPG national average range.",
        },
      },
      citations: [],
      meta: {
        assessmentGenerationId: "ag_ra8275",
        generatedAt: new Date("2026-11-10T00:00:00Z"),
        modelUsed: null,
        latencyMs: 1,
        inspectionNumber: "INS-1",
        propertyAddress: "1 Test St",
      },
    });
    const text = await pdfText(bytes);
    expect(text).toContain("total not available");
    expect(text).not.toContain("$0.00");
    expect(text).toContain("Not priced");
    expect(text).toContain("In labour");
    expect(text).toContain("$151.00");
    expect(text).toContain("Needed");
    expect(text).not.toContain("null");
  });
});
