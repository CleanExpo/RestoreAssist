/**
 * RA-8281 — estimateFromPriceList, the shared pricing step for the
 * assessment domains.
 */
import { describe, expect, it } from "vitest";
import { getGstTreatment } from "@/lib/gst-rules";
import { getFieldRange } from "@/lib/nrpg-rate-ranges";
import {
  NO_PRICE_LIST_FIELD_NOTE,
  QUANTITY_NEEDED_NOTE,
  estimateFromPriceList,
  type PriceListLine,
} from "../price-list-estimate";

const AU = getGstTreatment("AU");
const NZ = getGstTreatment("NZ");

// A value inside the field's NRPG range.
const inRange = (field: string): number => {
  const r = getFieldRange(field);
  return r ? (r.min + r.max) / 2 : 100;
};

const line = (
  rateField: string | undefined,
  quantity: number | null = 2,
): PriceListLine => ({
  description: `Line ${rateField ?? "no field"}`,
  category: "EQUIPMENT",
  quantity,
  unit: "unit·day",
  rateField,
});

describe("estimateFromPriceList", () => {
  it("positive control: every rate set and in range gives a complete total", () => {
    const est = estimateFromPriceList(
      [
        line("dehumidifierLGRDailyRate", 3),
        { ...line("mobilisationFee", 1), unit: "job" },
      ],
      { dehumidifierLGRDailyRate: 100, mobilisationFee: 200 },
      AU,
    );
    expect(est.totals.status).toBe("complete");
    expect(est.totals.subtotalExGst).toBe(500);
    expect(est.totals.gstTotal).toBe(50);
    expect(est.totals.totalIncGst).toBe(550);
    expect(est.totals.currency).toBe("AUD");
    expect(est.lines.map((l) => l.rate)).toEqual([100, 200]);
  });

  it("uses the GST treatment it is given (NZ 15% NZD)", () => {
    const est = estimateFromPriceList(
      [line("dehumidifierLGRDailyRate", 3)],
      { dehumidifierLGRDailyRate: 100 },
      NZ,
    );
    expect(est.totals.gstTotal).toBe(45);
    expect(est.totals.totalIncGst).toBe(345);
    expect(est.totals.currency).toBe("NZD");
    expect(est.totals.gstRate).toBe(0.15);
  });

  it("an unset rate reads 'rate not set' with no national range and blocks the total", () => {
    const est = estimateFromPriceList(
      [
        line("dehumidifierLGRDailyRate"),
        { ...line("mobilisationFee", 1), unit: "job" },
      ],
      { mobilisationFee: 200 },
      AU,
    );
    const [unset, set] = est.lines;
    expect(unset.pricingStatus).toBe("rate_not_set");
    expect(unset.rate).toBeNull();
    expect(unset.lineTotalExGst).toBeNull();
    expect(unset.pricingNote).toBe(
      "Rate not set. Set dehumidifierLGRDailyRate in your price list.",
    );
    expect(set.pricingStatus).toBe("priced");
    expect(est.totals.status).toBe("blocked");
    expect(est.totals.subtotalExGst).toBeNull();
    expect(est.totals.gstTotal).toBeNull();
    expect(est.totals.totalIncGst).toBeNull();
    expect(est.totals.missing).toEqual([
      { description: unset.description, note: unset.pricingNote },
    ]);
  });

  it("a rate outside the NRPG range blocks the total", () => {
    const est = estimateFromPriceList(
      [line("dehumidifierLGRDailyRate")],
      { dehumidifierLGRDailyRate: 99999 },
      AU,
    );
    expect(est.lines[0].pricingStatus).toBe("rate_out_of_range");
    expect(est.totals.status).toBe("blocked");
  });

  it("a line with no price-list field blocks the total", () => {
    const est = estimateFromPriceList([line(undefined)], {}, AU);
    expect(est.lines[0].pricingStatus).toBe("needs_price_list_field");
    expect(est.lines[0].pricingNote).toBe(NO_PRICE_LIST_FIELD_NOTE);
    expect(est.totals.totalIncGst).toBeNull();
  });

  it.each([0, -1, Number.NaN, null])(
    "a quantity of %s reads 'quantity needed' and blocks the total, never $0",
    (q) => {
      const est = estimateFromPriceList(
        [line("dehumidifierLGRDailyRate", q)],
        { dehumidifierLGRDailyRate: 100 },
        AU,
      );
      expect(est.lines[0].pricingStatus).toBe("quantity_needed");
      expect(est.lines[0].pricingNote).toBe(QUANTITY_NEEDED_NOTE);
      expect(est.lines[0].lineTotalExGst).toBeNull();
      expect(est.totals.status).toBe("blocked");
    },
  );

  it.each([
    ["m²", "extractionElectricHourlyRate", "per hr"],
    ["job", "afdUnitLargeDailyRate", "per day"],
    ["hr", "mobilisationFee", "as a flat fee"],
    ["day", "biohazardTreatmentRate", "per m²"],
  ])(
    "a %s line never prices from %s (unit mismatch blocks the total)",
    (unit, field, per) => {
      const est = estimateFromPriceList(
        [{ ...line(field, 20), unit }],
        { [field]: 100 },
        AU,
      );
      expect(est.lines[0].pricingStatus).toBe("needs_price_list_field");
      expect(est.lines[0].pricingNote).toContain(per);
      expect(est.lines[0].lineTotalExGst).toBeNull();
      expect(est.totals.totalIncGst).toBeNull();
    },
  );

  it.each([
    ["m²", "biohazardTreatmentRate"],
    ["day", "afdUnitLargeDailyRate"],
    ["unit·day", "negativeAirMachineDailyRate"],
    ["visit", "monitoringVisitDailyRate"],
    ["job", "mobilisationFee"],
    ["hr", "extractionElectricHourlyRate"],
  ])("control: a %s line prices from %s", (unit, field) => {
    const est = estimateFromPriceList(
      [{ ...line(field, 2), unit }],
      { [field]: inRange(field) },
      AU,
    );
    expect(est.lines[0].pricingStatus).toBe("priced");
  });

  it("no price list at all: every line reads rate not set", () => {
    const est = estimateFromPriceList(
      [line("dehumidifierLGRDailyRate")],
      null,
      AU,
    );
    expect(est.lines[0].pricingStatus).toBe("rate_not_set");
    expect(est.totals.totalIncGst).toBeNull();
  });
});
