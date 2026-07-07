/**
 * RA-7006 Gap 1 — pricing/safety reconciliation tests. The priced scope must
 * never silently contradict the safety plan: a mould job with air movers in the
 * selection raises a CRITICAL advisory; an over-supply raises a warning; a clean
 * job stays quiet.
 */
import { describe, it, expect } from "vitest";
import { reconcilePricingSafety } from "../reconcile-pricing-safety";

const areas = [{ length: 6, width: 5, wetPercentage: 100 }]; // 30 m²

describe("reconcilePricingSafety", () => {
  it("flags CRITICAL when air movers are priced on a mould job", () => {
    const r = reconcilePricingSafety({
      scopeAreas: areas,
      equipmentSelection: [{ type: "air_mover", quantity: 8 }],
      waterCategory: "Category 3",
      mouldActive: true,
    });
    expect(r.airMoverQty).toBe(8);
    const crit = r.advisories.filter((a) => a.severity === "critical");
    expect(crit.length).toBeGreaterThan(0);
    expect(crit[0].text).toMatch(/Condition 1|S520|Phase 2/);
  });

  it("no critical advisory when air movers are priced on a non-mould job", () => {
    const r = reconcilePricingSafety({
      scopeAreas: areas,
      equipmentSelection: [{ type: "air_mover", quantity: 8 }],
      waterCategory: "Category 2",
      mouldActive: false,
    });
    expect(r.advisories.some((a) => a.severity === "critical")).toBe(false);
  });

  it("warns when the selection can't fit the supply (single 20A circuit)", () => {
    const r = reconcilePricingSafety({
      scopeAreas: [{ length: 12, width: 10, wetPercentage: 100 }], // 120 m²
      equipmentSelection: [{ type: "air_mover", quantity: 12 }],
      waterCategory: "Category 2",
      mouldActive: false,
      powerAssessment: { circuits: 1, circuitRatingA: 20 },
    });
    expect(r.equipmentPlan?.powerConstrained).toBe(true);
    expect(r.advisories.some((a) => a.severity === "warning")).toBe(true);
  });

  it("derives PPE + recommendations for the priced document", () => {
    const r = reconcilePricingSafety({
      scopeAreas: areas,
      equipmentSelection: [],
      waterCategory: "Category 3",
      mouldActive: true,
    });
    expect(r.ppe.respiratory).toBe("P3");
    expect(r.recommendations.length).toBeGreaterThan(5);
  });

  it("stays quiet on a clean Category 1 job with no mould", () => {
    const r = reconcilePricingSafety({
      scopeAreas: areas,
      equipmentSelection: [{ type: "dehumidifier", quantity: 2 }],
      waterCategory: "Category 1",
      mouldActive: false,
    });
    expect(r.advisories.length).toBe(0);
  });
});
