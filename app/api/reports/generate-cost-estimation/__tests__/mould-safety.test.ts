import { describe, expect, it } from "vitest";
import { getGstTreatment } from "@/lib/gst-rules";
import { buildCostEstimationData } from "../route";

/**
 * Same invariant as the scope of works, on the document that carries the money.
 *
 * The safety flag was built from the tier-1 hazard TICKBOXES alone, so a job
 * whose only mould signal was the "Other" free text, the technician's written
 * report, `hazardType`, or the American spelling was ESTIMATED with mould off
 * and priced Phase 1 air movers -- on a job the report classified mould-active.
 *
 * Sabotage that proves these: restore
 *   `hasMould || report.biologicalMouldDetected || report.biologicalMouldCategory`
 * The four free-text cases go red; the tickbox and column cases stay green.
 */

const PRICING = new Proxy({}, { get: () => 50 }) as Record<string, number>;

const AIR_MOVERS = [
  { groupId: "airmover-1500", type: "air_mover", quantity: 6, dailyRate: 25 },
];
const SCOPE_AREAS = [{ length: 8, width: 5, wetPercentage: 100 }];

function estimate(
  reportOver: Record<string, unknown> = {},
  tier1Over: Record<string, unknown> = {},
) {
  return buildCostEstimationData({
    report: {
      id: "rep_1",
      reportNumber: "RA-1",
      claimReferenceNumber: "CLM-1",
      waterCategory: "2",
      biologicalMouldDetected: false,
      biologicalMouldCategory: null,
      hazardType: "water damage",
      technicianFieldReport: "Burst flexi hose under the vanity.",
      inspection: null,
      ...reportOver,
    },
    analysis: null,
    tier1: { T1_Q7_hazards: ["None identified"], ...tier1Over },
    tier2: null,
    tier3: null,
    pricingConfig: PRICING,
    stateInfo: null,
    scopeData: { lineItems: [] },
    equipmentSelection: AIR_MOVERS,
    scopeAreas: SCOPE_AREAS,
    gstTreatment: getGstTreatment("AU"),
  }) as {
    safety: {
      mouldActive: boolean;
      advisories: Array<{ severity: string; text: string }>;
    };
  };
}

const criticals = (e: ReturnType<typeof estimate>) =>
  e.safety.advisories.filter((a) => a.severity === "critical");

describe("cost estimation — the mould gate reads every signal the report does", () => {
  it("stays off when nothing indicates mould", () => {
    const e = estimate();
    expect(e.safety.mouldActive).toBe(false);
    expect(criticals(e)).toHaveLength(0);
  });

  it.each([
    ["the tier-1 hazard tickbox", {}, { T1_Q7_hazards: ["Active mould growth (black, green, powdery growth)"] }],
    ["the biological flag", { biologicalMouldDetected: true }, {}],
  ])("flags mould from %s", (_label, reportOver, tier1Over) => {
    const e = estimate(reportOver, tier1Over);
    expect(e.safety.mouldActive).toBe(true);
    expect(criticals(e)).toHaveLength(1);
  });

  /** THE LOAD-BEARING CASES — every one previously estimated with mould off. */
  it.each([
    [
      "the free text beside the Other tickbox",
      {},
      { T1_Q7_hazards: ["Other"], T1_Q7_hazardsOther: "mould in the wall cavity" },
    ],
    [
      "the technician's written report",
      { technicianFieldReport: "Visible mould behind the vanity." },
      {},
    ],
    ["the hazard type", { hazardType: "mould remediation" }, {}],
    [
      "the American spelling anywhere",
      { technicianFieldReport: "black mold on the plasterboard" },
      {},
    ],
  ])("flags mould recorded only in %s", (_label, reportOver, tier1Over) => {
    const e = estimate(reportOver, tier1Over);
    expect(e.safety.mouldActive).toBe(true);
    expect(criticals(e)).toHaveLength(1);
    expect(criticals(e)[0].text).toMatch(/S520/);
  });

  /**
   * The scoping guard: `hasMould` still drives the PRICED lines and is
   * deliberately not widened. Widening it would start charging mould
   * remediation on a prose mention -- a repricing, not a safety fix. If someone
   * later widens it, this goes red and that decision gets made deliberately.
   */
  it("does not change the estimate for a job whose only mould signal is prose", () => {
    const clean = estimate();
    const prose = estimate({
      technicianFieldReport: "Visible mould behind the vanity.",
    });

    expect(prose.safety.mouldActive).toBe(true);
    // `categories` and `totals` are the priced output. Asserted by name after
    // checking they exist and are non-empty: an earlier version of this test
    // compared `lineItems` and `totalExGst`, which this builder does not return
    // at all, so it compared undefined to undefined and proved nothing.
    expect(Object.keys((clean as any).categories ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys((clean as any).totals ?? {}).length).toBeGreaterThan(0);
    expect((prose as any).categories).toEqual((clean as any).categories);
    expect((prose as any).totals).toEqual((clean as any).totals);
  });
});
