import { describe, it, expect } from "vitest";
import { hasFloorPlanUnderlay } from "../floor-plan-entitlement";

describe("hasFloorPlanUnderlay", () => {
  it("grants the floor-plan underlay on Premium and Enterprise", () => {
    expect(hasFloorPlanUnderlay("PREMIUM")).toBe(true);
    expect(hasFloorPlanUnderlay("ENTERPRISE")).toBe(true);
  });

  it("denies it on Standard", () => {
    expect(hasFloorPlanUnderlay("STANDARD")).toBe(false);
  });

  it("denies it when the user has no tier", () => {
    expect(hasFloorPlanUnderlay(null)).toBe(false);
    expect(hasFloorPlanUnderlay(undefined)).toBe(false);
  });
});
