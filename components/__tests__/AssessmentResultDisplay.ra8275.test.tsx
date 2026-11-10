// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AssessmentResultDisplay, {
  type GenerateResultPayload,
} from "../assessments/AssessmentResultDisplay";

// RA-8275 — a fire estimate with an unpriced line must say so. It must
// never show "$0.00" for a line or a total that has no rate.

const blocked: GenerateResultPayload = {
  assessmentGenerationId: "ag_1",
  report: { sections: [] },
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
    lines: [
      {
        description: "Call-out Fee",
        category: "ADMIN",
        quantity: 1,
        unit: "ea",
        rate: 151,
        lineTotalExGst: 151,
        gstAmount: 15.1,
        lineTotalIncGst: 166.1,
        pricingStatus: "priced",
      },
      {
        description: "Ozone Treatment",
        category: "EQUIPMENT",
        quantity: 2,
        unit: "unit-day",
        rate: null,
        lineTotalExGst: null,
        gstAmount: null,
        lineTotalIncGst: null,
        pricingStatus: "rate_not_set",
        pricingNote:
          "Rate not set. Set rateOzoneGenerator in your price list (national range $75-$165 per day).",
      },
    ],
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
    domain: "FIRE_SMOKE",
    generatedAt: "2026-11-10T00:00:00Z",
    modelUsed: null,
    latencyMs: 1,
    costEstimateUsd: 0,
    workspaceId: null,
  },
};

describe("AssessmentResultDisplay — RA-8275 blocked estimate", () => {
  it("states the total is not available and never shows $0.00", () => {
    const { container } = render(<AssessmentResultDisplay result={blocked} />);
    expect(
      screen.getByText(/total not available: 1 line\(s\) not priced/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("$0.00");
    expect(screen.getAllByText("Not priced").length).toBe(3);
    expect(
      screen.getByText(/Set rateOzoneGenerator in your price list/),
    ).toBeInTheDocument();
    expect(screen.getByText("Needed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Priced from your contractor's own rates, within the NRPG national average range.",
      ),
    ).toBeInTheDocument();
  });
});

// RA-8281 review (CodeRabbit): the summary printed a fixed "AUD", so an NZ
// estimate (15% GST, NZD) was labelled AUD on screen while its PDF said NZD.
describe("AssessmentResultDisplay — RA-8281 summary currency and GST rate", () => {
  const complete = (gstRate: number, currency: string): GenerateResultPayload => ({
    ...blocked,
    estimate: {
      lines: [blocked.estimate.lines[0]],
      totals: {
        subtotalExGst: 151,
        gstTotal: +(151 * gstRate).toFixed(2),
        totalIncGst: +(151 * (1 + gstRate)).toFixed(2),
        gstRate,
        currency,
        status: "complete",
        missing: [],
      },
    },
  });

  it("an NZ estimate reads NZD and 15% GST, never AUD", () => {
    const { container } = render(
      <AssessmentResultDisplay result={complete(0.15, "NZD")} />,
    );
    expect(screen.getByText(/NZD ex GST 151\.00 · GST 15% 22\.65/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("AUD");
  });

  it("an AU estimate reads AUD and 10% GST", () => {
    render(<AssessmentResultDisplay result={complete(0.1, "AUD")} />);
    expect(screen.getByText(/AUD ex GST 151\.00 · GST 10% 15\.10/)).toBeInTheDocument();
  });
});
