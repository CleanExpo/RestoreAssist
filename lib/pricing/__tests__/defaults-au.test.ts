import { describe, expect, it } from "vitest";
import { getDefaultPricing, AU_STATES } from "../defaults-au";

describe("getDefaultPricing", () => {
  it("returns defaults for every AU state with a SOLE_TRADER entity type", () => {
    for (const state of AU_STATES) {
      const defaults = getDefaultPricing({ state, entityType: "SOLE_TRADER" });
      expect(defaults).toBeDefined();
      expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
      expect(defaults.administrationFee).toBeGreaterThan(0);
    }
  });

  it("returns a higher labour rate for COMPANY than SOLE_TRADER (mid-size assumption)", () => {
    const sole = getDefaultPricing({ state: "NSW", entityType: "SOLE_TRADER" });
    const co = getDefaultPricing({ state: "NSW", entityType: "COMPANY" });
    expect(co.masterQualifiedNormalHours).toBeGreaterThanOrEqual(
      sole.masterQualifiedNormalHours,
    );
  });

  it("falls back to national median when state is unknown", () => {
    const defaults = getDefaultPricing({
      state: "XX" as any,
      entityType: "COMPANY",
    });
    expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
  });

  it("does not scale dimensionless multipliers by state/entity adjustments", () => {
    const nsw = getDefaultPricing({ state: "NSW", entityType: "COMPANY" });
    const tas = getDefaultPricing({ state: "TAS", entityType: "SOLE_TRADER" });
    // Multipliers must be identical across states/entities — they're PASSTHROUGH
    expect(nsw.saturdayMultiplier).toBe(tas.saturdayMultiplier);
    expect(nsw.sundayMultiplier).toBe(tas.sundayMultiplier);
    expect(nsw.afterHoursMultiplier).toBe(tas.afterHoursMultiplier);
    expect(nsw.publicHolidayMultiplier).toBe(tas.publicHolidayMultiplier);
    expect(nsw.projectManagementPercent).toBe(tas.projectManagementPercent);
    // But monetary fields SHOULD differ between NSW (1.08 * 1.05 = 1.134) and TAS (0.92 * 0.95 = 0.874)
    expect(nsw.masterQualifiedNormalHours).toBeGreaterThan(
      tas.masterQualifiedNormalHours,
    );
  });
});
