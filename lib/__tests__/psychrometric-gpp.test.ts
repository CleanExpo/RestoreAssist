/**
 * Unit tests for the corrected Grains Per Pound (GPP) psychrometric formula.
 *
 * Pins known reference points from the standard psychrometric chart at sea-level
 * pressure (101.325 kPa). The previous implementation overstated GPP by ~2.6x by
 * multiplying by (0.622 / 0.378) instead of the mole-mass ratio 0.62198.
 *
 * Reference values (ASHRAE / IICRC psychrometric chart, sea level):
 *   - 21.1C (70F) / 50% RH  ~= 54-55 GPP
 *   - 25C     / 50% RH      ~= 69 GPP
 *   - 26.7C (80F) / 60% RH  ~= 93-94 GPP
 *   - 32C     / 25% RH      ~= 51-52 GPP
 */

import { describe, it, expect } from "vitest";
import { calculateGPP } from "../psychrometric-calculations";

describe("calculateGPP — reference psychrometric points", () => {
  it("25C / 50% RH is approximately 69 GPP", () => {
    expect(calculateGPP(25, 50)).toBeCloseTo(69, 0);
  });

  it("21.1C / 50% RH is approximately 54 GPP", () => {
    const gpp = calculateGPP(21.1, 50);
    expect(gpp).toBeGreaterThan(52);
    expect(gpp).toBeLessThan(57);
  });

  it("26.7C / 60% RH is approximately 93 GPP", () => {
    const gpp = calculateGPP(26.7, 60);
    expect(gpp).toBeGreaterThan(90);
    expect(gpp).toBeLessThan(97);
  });

  it("32C / 25% RH is approximately 51 GPP", () => {
    const gpp = calculateGPP(32, 25);
    expect(gpp).toBeGreaterThan(48);
    expect(gpp).toBeLessThan(55);
  });
});

describe("calculateGPP — monotonic behaviour", () => {
  it("GPP rises with humidity at fixed temperature", () => {
    expect(calculateGPP(25, 60)).toBeGreaterThan(calculateGPP(25, 40));
  });

  it("GPP rises with temperature at fixed humidity", () => {
    expect(calculateGPP(30, 50)).toBeGreaterThan(calculateGPP(20, 50));
  });

  it("returns 0 GPP at 0% RH (bone-dry air holds no vapour)", () => {
    expect(calculateGPP(25, 0)).toBe(0);
  });
});

describe("calculateGPP — regression guard against the old 1.645 bug", () => {
  it("25C / 50% RH is NOT the old inflated ~183 GPP value", () => {
    // Old formula: 7000 * (Pw/(P-Pw)) * (0.622/0.378) ~= 183 GPP.
    expect(calculateGPP(25, 50)).toBeLessThan(100);
  });
});
