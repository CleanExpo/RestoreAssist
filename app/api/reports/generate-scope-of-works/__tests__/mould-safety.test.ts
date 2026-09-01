import { describe, expect, it } from "vitest";
import { buildScopeOfWorksData } from "../route";

/**
 * The mould flag on the PRICED document must not be narrower than the one the
 * report acts on.
 *
 * Before this, the safety flag was built from the tier-1 hazard TICKBOXES
 * alone. It therefore missed mould recorded in `T1_Q7_hazardsOther` (the free
 * text beside "Other" on that same question), in the technician's written
 * report, in `hazardType`, or spelled the American way. Each of those produced
 * a scope of works priced with mould switched off -- carrying Phase 1 air
 * movers -- on a job the report classified mould-active.
 *
 * Sabotage that proves these: restore the old expression
 *   `hasMould || report.biologicalMouldDetected || report.biologicalMouldCategory`
 * Cases 4-7 go red; 1-3 stay green, because those were always caught.
 */

/** Minimal pricing config -- only the rate lookups the builder reads. */
const PRICING = new Proxy(
  {},
  { get: () => 50 },
) as Record<string, number>;

// `groupId` drives the pricing lookup; the reconciler's own matcher reads the
// name/type words. Both are real values from lib/equipment-matrix.
const AIR_MOVERS = [
  { groupId: "airmover-1500", type: "air_mover", quantity: 6, dailyRate: 25 },
];
const SCOPE_AREAS = [{ length: 8, width: 5, wetPercentage: 100 }];

function scope(
  reportOver: Record<string, unknown> = {},
  tier1Over: Record<string, unknown> = {},
) {
  return buildScopeOfWorksData({
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
    equipmentSelection: AIR_MOVERS,
    scopeAreas: SCOPE_AREAS,
  }) as { safety: { mouldActive: boolean; advisories: Array<{ severity: string; text: string }> } };
}

const criticals = (s: ReturnType<typeof scope>) =>
  s.safety.advisories.filter((a) => a.severity === "critical");

describe("scope of works — the mould gate reads every signal the report does", () => {
  it("stays off when nothing indicates mould", () => {
    const s = scope();
    expect(s.safety.mouldActive).toBe(false);
    expect(criticals(s)).toHaveLength(0);
  });

  // 1-3: caught by the old tickbox-only expression too.
  it.each([
    ["the tier-1 hazard tickbox", {}, { T1_Q7_hazards: ["Active mould growth (black, green, powdery growth)"] }],
    ["the biological flag", { biologicalMouldDetected: true }, {}],
    ["a recorded condition", { biologicalMouldCategory: "Condition 3" }, {}],
  ])("flags mould from %s", (_label, reportOver, tier1Over) => {
    const s = scope(reportOver, tier1Over);
    expect(s.safety.mouldActive).toBe(true);
    expect(criticals(s)).toHaveLength(1);
    expect(criticals(s)[0].text).toMatch(/S520/);
  });

  /**
   * 4-7: THE LOAD-BEARING CASES. Every one of these was previously priced with
   * mould off while the report for the same job classified it mould-active.
   */
  it.each([
    [
      "the free text beside the Other tickbox",
      {},
      { T1_Q7_hazards: ["Other"], T1_Q7_hazardsOther: "mould in the wall cavity" },
    ],
    [
      "the technician's written report",
      { technicianFieldReport: "Cupped boards and visible mould behind the vanity." },
      {},
    ],
    ["the hazard type", { hazardType: "mould remediation" }, {}],
    [
      "the American spelling anywhere",
      { technicianFieldReport: "black mold on the plasterboard" },
      {},
    ],
  ])("flags mould recorded only in %s", (_label, reportOver, tier1Over) => {
    const s = scope(reportOver, tier1Over);
    expect(s.safety.mouldActive).toBe(true);
    expect(criticals(s)).toHaveLength(1);
    expect(criticals(s)[0].text).toMatch(/air mover/i);
  });

  /**
   * The scoping guard. `hasMould` also drives PRICED lines (mould remediation
   * treatment, PPE, hazard surcharges) and is deliberately NOT widened: doing so
   * would start charging mould remediation on a prose mention, which is a
   * repricing, not a safety fix. If someone later widens `hasMould` itself, this
   * goes red and the commercial decision gets made deliberately.
   */
  it("does not reprice a job whose only mould signal is prose", () => {
    const clean = scope();
    const prose = scope({
      technicianFieldReport: "Visible mould behind the vanity.",
    });

    expect(prose.safety.mouldActive).toBe(true);
    expect((prose as any).lineItems).toEqual((clean as any).lineItems);
  });
});
