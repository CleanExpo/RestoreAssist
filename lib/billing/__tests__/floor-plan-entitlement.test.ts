import { describe, it, expect } from "vitest";
import { hasFloorPlanUnderlay } from "../floor-plan-entitlement";

/**
 * F2 (RA-6929/6930/6931) — the floor-plan underlay has NO entitlement source
 * until RA-6922. The predicate must deny every input so the feature is gated
 * off for all users and no nonexistent "Premium" plan is sold.
 */
describe("hasFloorPlanUnderlay — gated off pending RA-6922 (F2)", () => {
  it("returns false for every tier value", () => {
    expect(hasFloorPlanUnderlay("PREMIUM")).toBe(false);
    expect(hasFloorPlanUnderlay("ENTERPRISE")).toBe(false);
    expect(hasFloorPlanUnderlay("STANDARD")).toBe(false);
  });

  it("returns false for null / undefined", () => {
    expect(hasFloorPlanUnderlay(null)).toBe(false);
    expect(hasFloorPlanUnderlay(undefined)).toBe(false);
  });

  it("returns false when called with no argument", () => {
    expect(hasFloorPlanUnderlay()).toBe(false);
  });
});
