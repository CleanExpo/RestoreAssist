import { describe, expect, it, vi } from "vitest";

/**
 * RA-8281 (B2): the shared blocked-line helper every pricing engine uses.
 */

const { hiddenRanges } = vi.hoisted(() => ({
  hiddenRanges: new Set<string>(),
}));
// A field in `hiddenRanges` reads as having no NRPG national range.
vi.mock("@/lib/nrpg-rate-ranges", async (original) => {
  const actual = await original<typeof import("@/lib/nrpg-rate-ranges")>();
  return {
    ...actual,
    getFieldRange: (field: string) =>
      hiddenRanges.has(field) ? undefined : actual.getFieldRange(field),
  };
});

import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import {
  blockedPricing,
  blockedRates,
  nationalRangeText,
  priceListReader,
  rateNotSetText,
  RATE_NOT_SET_LABEL,
  sumOrBlocked,
  TOTAL_NOT_AVAILABLE_NOTE,
} from "@/lib/pricing/blocked-line";
import { blockedPricingResponse } from "@/lib/pricing/blocked-line-response";

const CALL_OUT = NRPG_RATE_RANGES.callOutFee;
const LABOUR = NRPG_RATE_RANGES.labourerNormalHours;

describe("blockedRates", () => {
  it("names an unset field with its note and the recorded national range", () => {
    expect(blockedRates({ callOutFee: null }, ["callOutFee"])).toEqual([
      {
        field: "callOutFee",
        note: `Rate not set. Set callOutFee in your price list (national range $${CALL_OUT.min}-$${CALL_OUT.max}).`,
        nationalRange: {
          min: CALL_OUT.min,
          max: CALL_OUT.max,
          unit: CALL_OUT.unit,
        },
      },
    ]);
  });

  it("gives no range for a field the range table does not hold", () => {
    // A fire price-list field: its range is still to be supplied.
    expect(NRPG_RATE_RANGES.rateFireDebrisRemoval).toBeUndefined();
    expect(blockedRates({}, ["rateFireDebrisRemoval"])).toEqual([
      {
        field: "rateFireDebrisRemoval",
        note: "Rate not set. Set rateFireDebrisRemoval in your price list.",
        nationalRange: null,
      },
    ]);
  });

  it("reports nothing for a set rate, and treats no price list as all unset", () => {
    expect(blockedRates({ callOutFee: 120 }, ["callOutFee"])).toEqual([]);
    for (const none of [null, undefined]) {
      expect(blockedRates(none, ["callOutFee"]).map((b) => b.field)).toEqual([
        "callOutFee",
      ]);
    }
  });

  it.each([undefined, null, NaN, Infinity, "120", ""])(
    "a stored %s is not a rate",
    (value) => {
      expect(blockedRates({ callOutFee: value }, ["callOutFee"])).toHaveLength(
        1,
      );
    },
  );
});

describe("priceListReader", () => {
  it("computes from the contractor's rates when every one is set", () => {
    const reader = priceListReader({ a: 10, b: 4 });
    expect(reader.calc(["a", "b"], (a, b) => 3 * a + b)).toBe(34);
    expect(reader.lineFields(["a", "b"])).toEqual({});
    expect(reader.missing()).toEqual([]);
  });

  it("returns null and never calls the formula when a rate is not set", () => {
    const formula = vi.fn(() => 0);
    const reader = priceListReader({ callOutFee: null, labourerNormalHours: 50 });

    expect(
      reader.calc(["labourerNormalHours", "callOutFee"], formula),
    ).toBeNull();
    expect(formula).not.toHaveBeenCalled();
  });

  it("a line that needs an unset rate carries the blocked-line fields", () => {
    const reader = priceListReader({ callOutFee: null });
    expect(reader.lineFields(["callOutFee"])).toEqual({
      pricingStatus: "rate_not_set",
      rateField: "callOutFee",
      pricingNote: `Rate not set. Set callOutFee in your price list (national range $${CALL_OUT.min}-$${CALL_OUT.max}).`,
      nationalRange: {
        min: CALL_OUT.min,
        max: CALL_OUT.max,
        unit: CALL_OUT.unit,
      },
    });
  });

  it("a line that needs two unset rates names both", () => {
    const reader = priceListReader({});
    const fields = reader.lineFields(["labourerNormalHours", "callOutFee"]);
    expect(fields).toMatchObject({
      rateField: "labourerNormalHours",
      nationalRange: { min: LABOUR.min, max: LABOUR.max, unit: LABOUR.unit },
    });
    expect((fields as { pricingNote: string }).pricingNote).toContain(
      "Set labourerNormalHours",
    );
    expect((fields as { pricingNote: string }).pricingNote).toContain(
      "Set callOutFee",
    );
  });

  it("records each unset field once, and only fields a line asked for", () => {
    const reader = priceListReader({
      callOutFee: null,
      administrationFee: null,
      labourerNormalHours: 50,
    });
    reader.calc(["callOutFee"], (r) => r);
    reader.calc(["callOutFee", "labourerNormalHours"], (c, l) => c + l);
    reader.lineFields(["callOutFee"]);

    // administrationFee is unset too, but no line read it.
    expect(reader.missing().map((m) => m.field)).toEqual(["callOutFee"]);
  });

  it("a rate of 0 the contractor saved is a rate, not an unset one", () => {
    const reader = priceListReader({ callOutFee: 0 });
    expect(reader.calc(["callOutFee"], (r) => r)).toBe(0);
    expect(reader.missing()).toEqual([]);
  });

  it("no price list at all blocks every line", () => {
    const reader = priceListReader(null);
    expect(reader.calc(["callOutFee"], (r) => r)).toBeNull();
    expect(reader.missing().map((m) => m.field)).toEqual(["callOutFee"]);
  });
});

describe("sumOrBlocked", () => {
  it("adds the values left to right", () => {
    expect(sumOrBlocked([0.1, 0.2, 0.3])).toBe(0.1 + 0.2 + 0.3);
    expect(sumOrBlocked([])).toBe(0);
  });

  it.each([null, undefined, NaN])(
    "is blocked by a %s among the values: never a partial sum",
    (gap) => {
      expect(sumOrBlocked([100, gap, 50])).toBeNull();
      expect(sumOrBlocked([gap])).toBeNull();
    },
  );
});

describe("what a blocked result shows", () => {
  it("the rate cell reads 'Rate not set' with the range when one exists", () => {
    expect(rateNotSetText({ min: 60, max: 170, unit: "$/hr" })).toBe(
      "Rate not set (national range $60-$170 per hr)",
    );
    expect(rateNotSetText(null)).toBe(RATE_NOT_SET_LABEL);
    expect(rateNotSetText()).toBe("Rate not set");
  });

  it("a flat fee range has no unit suffix", () => {
    expect(nationalRangeText({ min: 50, max: 400, unit: "$" })).toBe(
      "national range $50-$400",
    );
  });

  it("the total is null with the standard note", () => {
    const blocked = blockedPricing([], []);
    expect(blocked).toEqual({
      status: "blocked",
      lines: [],
      total: null,
      totalNote: "Total not available: rate not set",
      missing: [],
    });
    expect(TOTAL_NOT_AVAILABLE_NOTE).toBe("Total not available: rate not set");
  });

  it("the HTTP answer is a 422 that carries every line and names each unset rate", async () => {
    const missing = blockedRates({}, ["callOutFee"]);
    const res = blockedPricingResponse(
      blockedPricing(
        [
          {
            description: "Call-out",
            quantity: 1,
            unit: "EA",
            rate: null,
            subtotal: null,
            pricingStatus: "rate_not_set",
          },
        ],
        missing,
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toEqual({
      code: "RATE_NOT_SET",
      message: `Total not available: rate not set. ${missing[0].note}`,
    });
    expect(body.blocked.lines).toHaveLength(1);
    expect(body.blocked.total).toBeNull();
  });
});
