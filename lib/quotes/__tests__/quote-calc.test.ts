import { describe, expect, it } from "vitest";
import {
  MINIMUM_CHARGE_EX_GST,
  QuoteRequestSchema,
  applyMinimumCharge,
  calcGstOnSubtotal,
  dollarsToCents,
} from "../quote-calc";

describe("QuoteRequestSchema", () => {
  it("accepts a valid water quote payload", () => {
    const parsed = QuoteRequestSchema.safeParse({
      jobType: "water",
      affectedAreaM2: 45,
      numberOfRooms: 3,
      dryingDays: 4,
      labourHours: 16,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid job type", () => {
    const parsed = QuoteRequestSchema.safeParse({
      jobType: "flood",
      affectedAreaM2: 45,
      numberOfRooms: 3,
      dryingDays: 4,
      labourHours: 16,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects affectedAreaM2 below 1", () => {
    const parsed = QuoteRequestSchema.safeParse({
      jobType: "water",
      affectedAreaM2: 0,
      numberOfRooms: 3,
      dryingDays: 4,
      labourHours: 16,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("applyMinimumCharge", () => {
  it("enforces $2,750 minimum ex-GST", () => {
    const result = applyMinimumCharge(500);
    expect(result.minimumApplied).toBe(true);
    expect(result.subtotalExGST).toBe(MINIMUM_CHARGE_EX_GST);
  });

  it("does not raise totals already above minimum", () => {
    const result = applyMinimumCharge(4000);
    expect(result.minimumApplied).toBe(false);
    expect(result.subtotalExGST).toBe(4000);
  });
});

describe("calcGstOnSubtotal", () => {
  it("applies 10% GST with cent rounding", () => {
    const { gst, totalIncGST } = calcGstOnSubtotal(2750);
    expect(gst).toBe(275);
    expect(totalIncGST).toBe(3025);
  });
});

describe("dollarsToCents", () => {
  it("rounds half-up style via Math.round", () => {
    expect(dollarsToCents(12.345)).toBe(1235);
    expect(dollarsToCents(12.344)).toBe(1234);
  });
});
