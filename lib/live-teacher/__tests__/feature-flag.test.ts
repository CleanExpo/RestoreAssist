import { describe, it, expect } from "vitest";
import { isLiveTeacherEnabled } from "../feature-flag";

describe("isLiveTeacherEnabled", () => {
  it("defaults OFF when unset or empty", () => {
    expect(isLiveTeacherEnabled(undefined)).toBe(false);
    expect(isLiveTeacherEnabled("")).toBe(false);
    expect(isLiveTeacherEnabled("   ")).toBe(false);
  });

  it("opens only on explicit truthy values", () => {
    expect(isLiveTeacherEnabled("1")).toBe(true);
    expect(isLiveTeacherEnabled("true")).toBe(true);
    expect(isLiveTeacherEnabled("TRUE")).toBe(true);
    expect(isLiveTeacherEnabled(" on ")).toBe(true);
  });

  it("stays OFF for non-truthy strings", () => {
    expect(isLiveTeacherEnabled("0")).toBe(false);
    expect(isLiveTeacherEnabled("false")).toBe(false);
    expect(isLiveTeacherEnabled("yes")).toBe(false);
    expect(isLiveTeacherEnabled("enabled")).toBe(false);
  });
});
