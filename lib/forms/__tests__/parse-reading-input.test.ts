import { describe, it, expect } from "vitest";
import { parseReadingInput } from "../parse-reading-input";

// RA-7019: numeric reading inputs (temperature, humidity, moisture) must reject
// loudly and never silently transform. The prior `parseFloat(e.target.value) || 0`
// turned empty/invalid input into a plausible-looking 0 on insurer-facing reports,
// and parseFloat's partial-parse ("12abc" -> 12) is the same defect class the
// SerpentSpore audit flagged. parseReadingInput returns the exact number for valid
// finite input and null ("not recorded") otherwise — 0 stays a real, distinct value.

describe("parseReadingInput", () => {
  it("preserves a decimal reading exactly", () => {
    expect(parseReadingInput("8.25")).toBe(8.25);
  });

  it("preserves a negative reading exactly", () => {
    expect(parseReadingInput("-2.3")).toBe(-2.3);
  });

  it("keeps a real zero as 0, distinct from not-recorded", () => {
    expect(parseReadingInput("0")).toBe(0);
  });

  it("returns null for an empty string (not recorded, never 0)", () => {
    expect(parseReadingInput("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(parseReadingInput("   ")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseReadingInput("abc")).toBeNull();
  });

  it("rejects partial-numeric input loudly instead of silently truncating", () => {
    // parseFloat("12abc") === 12 — the silent-mangle defect. Number() rejects it.
    expect(parseReadingInput("12abc")).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(parseReadingInput("Infinity")).toBeNull();
    expect(parseReadingInput("-Infinity")).toBeNull();
    expect(parseReadingInput("NaN")).toBeNull();
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseReadingInput("  8.25  ")).toBe(8.25);
  });
});
