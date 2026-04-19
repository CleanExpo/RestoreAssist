/**
 * RA-861 — tests for the 14 new rate-range entries.
 *
 * Verifies:
 *   - Every new field is registered in NRPG_RATE_RANGES
 *   - validateRateInRange() returns the expected min/max bounds
 *   - validateRateInRange() flags out-of-range values correctly
 *   - getFieldRange() returns the right unit + label
 */

import { describe, it, expect } from "vitest";
import {
  NRPG_RATE_RANGES,
  validateRateInRange,
  getFieldRange,
} from "../nrpg-rate-ranges";

const NEW_FIELDS: Array<{ field: string; min: number; max: number }> = [
  { field: "rateNegativeAirMachine", min: 85, max: 185 },
  { field: "rateHEPAVacuum", min: 45, max: 95 },
  { field: "rateOzoneGenerator", min: 75, max: 165 },
  { field: "rateHydroxylUnit", min: 85, max: 175 },
  { field: "rateMouldRemediation", min: 65, max: 145 },
  { field: "rateFireRestoration", min: 85, max: 195 },
  { field: "rateStormWaterExtraction", min: 55, max: 125 },
  { field: "rateBiohazardClean", min: 95, max: 225 },
  { field: "rateMobilisation", min: 150, max: 450 },
  { field: "rateMonitoring", min: 35, max: 85 },
  { field: "rateWasteDisposal", min: 45, max: 125 },
  { field: "rateContentsPack", min: 35, max: 85 },
  { field: "rateContentsClean", min: 45, max: 115 },
  { field: "rateDehumidifierLarge", min: 95, max: 215 },
];

describe("RA-861 — NRPG_RATE_RANGES new fields", () => {
  it("all 14 new fields are registered", () => {
    for (const { field } of NEW_FIELDS) {
      expect(
        NRPG_RATE_RANGES[field],
        `missing NRPG range for ${field}`,
      ).toBeDefined();
    }
  });

  it.each(NEW_FIELDS)(
    "$field — min/max bounds match spec",
    ({ field, min, max }) => {
      const range = NRPG_RATE_RANGES[field];
      expect(range.min).toBe(min);
      expect(range.max).toBe(max);
    },
  );

  it.each(NEW_FIELDS)(
    "$field — validateRateInRange accepts midpoint",
    ({ field, min, max }) => {
      const mid = (min + max) / 2;
      const result = validateRateInRange(field, mid);
      expect(result).not.toBeNull();
      expect(result?.valid).toBe(true);
    },
  );

  it.each(NEW_FIELDS)(
    "$field — validateRateInRange rejects below min",
    ({ field, min }) => {
      const result = validateRateInRange(field, min - 1);
      expect(result?.valid).toBe(false);
    },
  );

  it.each(NEW_FIELDS)(
    "$field — validateRateInRange rejects above max",
    ({ field, max }) => {
      const result = validateRateInRange(field, max + 1);
      expect(result?.valid).toBe(false);
    },
  );

  it("getFieldRange returns the same range as NRPG_RATE_RANGES lookup", () => {
    for (const { field } of NEW_FIELDS) {
      expect(getFieldRange(field)).toEqual(NRPG_RATE_RANGES[field]);
    }
  });

  it("every new field has a unit and label", () => {
    for (const { field } of NEW_FIELDS) {
      const range = NRPG_RATE_RANGES[field];
      expect(typeof range.unit).toBe("string");
      expect(range.unit.length).toBeGreaterThan(0);
      expect(typeof range.label).toBe("string");
      expect(range.label.length).toBeGreaterThan(0);
    }
  });

  it("unknown field returns null", () => {
    expect(validateRateInRange("notAField", 100)).toBeNull();
  });
});
