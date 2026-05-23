import { describe, it, expect } from "vitest";
import { TRIAL_DAYS, T_MINUS_BANNER_DAYS } from "../constants";

describe("billing constants", () => {
  it("TRIAL_DAYS is 15", () => {
    expect(TRIAL_DAYS).toBe(15);
  });
  it("T_MINUS_BANNER_DAYS is 3", () => {
    expect(T_MINUS_BANNER_DAYS).toBe(3);
  });
  it("TRIAL_DAYS in ms equals 15 days", () => {
    expect(TRIAL_DAYS * 24 * 60 * 60 * 1000).toBe(1_296_000_000);
  });
});
