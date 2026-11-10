/**
 * RA-8281 item 2 — the six assessment domains price from the contractor's
 * own price list. A rate the contractor has not set reads "rate not set"
 * and blocks the total; it is never priced at $0, and no hard-coded
 * default rate stands in for it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/assessments/gst", async () => {
  const { getGstTreatment } = await import("@/lib/gst-rules");
  return { gstForInspection: vi.fn(async () => getGstTreatment("AU")) };
});
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { waterDomain } from "../domains/water";
import { mouldDomain } from "../domains/mould";
import { stormDomain } from "../domains/storm";
import { biohazardDomain } from "../domains/biohazard";
import { hvacDomain } from "../domains/hvac";
import { australianComplianceDomain } from "../domains/australian-compliance";
import type { DomainPlugin, EstimateLine } from "../types";
import { sqmToSqft } from "@/lib/units";

const inspectionFindUnique = (
  prisma as unknown as { inspection: { findUnique: ReturnType<typeof vi.fn> } }
).inspection.findUnique;
const resolvePricing = resolveEffectivePricing as unknown as ReturnType<
  typeof vi.fn
>;

/**
 * A contractor price list with every NRPG field set, inside its range, at
 * an odd figure no hard-coded default uses — so a priced line can only
 * carry this value if it came from the contractor's list.
 */
const FULL_PRICE_LIST: Record<string, number> = Object.fromEntries(
  Object.entries(NRPG_RATE_RANGES).map(([field, r]) => [
    field,
    Math.round((r.min * 0.6 + r.max * 0.4) * 100 + 7) / 100,
  ]),
);
const CONTRACTOR_RATES = new Set(Object.values(FULL_PRICE_LIST));

const INSPECTION = {
  id: "i_1",
  propertyAddress: "12 Smith St, Brisbane QLD 4000",
  propertyPostcode: "4000",
  classifications: [{ category: "2", class: "2" }],
  // As the capture API stores it: m2 canonical, sq ft dual-written (RA-7001).
  affectedAreas: [{ affectedAreaSqm: 20, affectedSquareFootage: sqmToSqft(20) }],
  moistureReadings: [],
  _count: { contentsPackOutItems: 0 },
};

const baseInput = { inspectionId: "i_1", workspaceId: "ws_1", userId: "u_1" };

beforeEach(() => {
  inspectionFindUnique.mockReset();
  inspectionFindUnique.mockResolvedValue(INSPECTION);
  resolvePricing.mockReset();
});

async function estimateFor(
  domain: DomainPlugin,
  options: Record<string, unknown> | null,
  priceList: Record<string, number | null> | null,
) {
  resolvePricing.mockResolvedValue(priceList);
  const r = await domain.generate({ ...baseInput, options });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  return r.data.estimate;
}

function expectNoZeroPricedLine(lines: EstimateLine[]) {
  for (const l of lines) {
    expect(l.rate).not.toBe(0);
    expect(l.lineTotalExGst).not.toBe(0);
  }
}

// Domains with lines priced from an existing price-list field.
const FIELD_PRICED: {
  name: string;
  domain: DomainPlugin;
  options: Record<string, unknown> | null;
  /** A field one of this scenario's lines is priced from. */
  field: string;
}[] = [
  {
    name: "water",
    domain: waterDomain,
    options: null,
    field: "mobilisationFee",
  },
  {
    name: "water (monitoring)",
    domain: waterDomain,
    options: null,
    field: "monitoringVisitDailyRate",
  },
  {
    name: "mould",
    domain: mouldDomain,
    options: { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
    field: "negativeAirMachineDailyRate",
  },
  {
    name: "storm",
    domain: stormDomain,
    options: { entryType: "roof_penetration", waterCategory: 2 },
    field: "dehumidifierLGRDailyRate",
  },
  {
    name: "biohazard",
    domain: biohazardDomain,
    options: { biohazardType: "sewage_overflow" },
    field: "biohazardTreatmentRate",
  },
];

describe.each(FIELD_PRICED)(
  "$name domain prices from the contractor's price list",
  ({ domain, options, field }) => {
    it(`an unset ${field} reads "rate not set" with its national range and blocks the total`, async () => {
      const est = await estimateFor(domain, options, {
        ...FULL_PRICE_LIST,
        [field]: null,
      });
      const unset = est.lines.filter((l) => l.pricingStatus === "rate_not_set");
      expect(unset.length).toBeGreaterThan(0);
      for (const l of unset) {
        expect(l.rate).toBeNull();
        expect(l.lineTotalExGst).toBeNull();
        expect(l.pricingNote).toContain(field);
        expect(l.pricingNote).toMatch(/national range \$\d/);
      }
      expect(est.totals.status).toBe("blocked");
      expect(est.totals.subtotalExGst).toBeNull();
      expect(est.totals.totalIncGst).toBeNull();
      expect(est.totals.missing?.length).toBeGreaterThan(0);
      expectNoZeroPricedLine(est.lines);
    });

    it("a contractor with no price list gets no default rates", async () => {
      const est = await estimateFor(domain, options, null);
      expect(est.lines.every((l) => l.rate === null)).toBe(true);
      expect(est.totals.status).toBe("blocked");
      expect(est.totals.totalIncGst).toBeNull();
    });

    it("positive control: every rate set prices each field line at the contractor's own rate", async () => {
      const est = await estimateFor(domain, options, FULL_PRICE_LIST);
      const priced = est.lines.filter((l) => l.pricingStatus === "priced");
      expect(priced.length).toBeGreaterThan(0);
      for (const l of priced) {
        expect(CONTRACTOR_RATES.has(l.rate as number)).toBe(true);
        expect(l.lineTotalExGst).toBeCloseTo(
          (l.quantity as number) * (l.rate as number),
          2,
        );
        expect(l.gstAmount).toBeCloseTo((l.lineTotalExGst as number) * 0.1, 2);
      }
      // With every rate set, only a line with no price-list field can block.
      for (const l of est.lines) {
        expect(["priced", "needs_price_list_field"]).toContain(l.pricingStatus);
      }
      expectNoZeroPricedLine(est.lines);
    });
  },
);

describe("mould positive control: a complete price list gives a complete total", () => {
  it("sums only contractor-priced lines, GST from gst-rules", async () => {
    const est = await estimateFor(
      mouldDomain,
      { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
      FULL_PRICE_LIST,
    );
    expect(est.totals.status).toBe("complete");
    const sub = est.lines.reduce((s, l) => s + (l.lineTotalExGst as number), 0);
    expect(est.totals.subtotalExGst).toBeCloseTo(sub, 2);
    expect(est.totals.totalIncGst).toBeCloseTo(sub * 1.1, 1);
    expect(est.totals.currency).toBe("AUD");
  });

  it.each([
    ["negative air machine", "negativeAirMachineDailyRate"],
    ["air scrubber", "afdUnitLargeDailyRate"],
    ["HEPA vacuum", "hepaVacuumDailyRate"],
    ["dehumidifier", "dehumidifierLGRDailyRate"],
  ])("each %s line is priced from %s alone", async (label, field) => {
    const est = await estimateFor(
      mouldDomain,
      { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
      { ...FULL_PRICE_LIST, [field]: null },
    );
    const unset = est.lines.filter((l) => l.pricingStatus === "rate_not_set");
    expect(unset.length).toBe(1);
    expect(unset[0].description.toLowerCase()).toContain(
      label.toLowerCase().split(" ")[0],
    );
    expect(unset[0].pricingNote).toContain(field);
  });
});

describe("a rate is never applied to a quantity in another unit (review round 1)", () => {
  it("storm water extraction (m²) is not priced from the hourly extraction rate", async () => {
    const est = await estimateFor(
      stormDomain,
      { entryType: "roof_penetration", waterCategory: 2 },
      FULL_PRICE_LIST,
    );
    const extraction = est.lines.find(
      (l) => l.description === "Water extraction",
    );
    expect(extraction?.unit).toBe("m²");
    expect(extraction?.pricingStatus).toBe("needs_price_list_field");
    expect(extraction?.lineTotalExGst).toBeNull();
    expect(est.totals.totalIncGst).toBeNull();
  });

  it("the biohazard HEPA air scrubber (once per job) is not priced from a daily hire rate", async () => {
    const est = await estimateFor(
      biohazardDomain,
      { biohazardType: "sewage_overflow" },
      FULL_PRICE_LIST,
    );
    const scrubber = est.lines.find(
      (l) => l.description === "HEPA air scrubber",
    );
    expect(scrubber?.unit).toBe("job");
    expect(scrubber?.pricingStatus).toBe("needs_price_list_field");
    expect(scrubber?.lineTotalExGst).toBeNull();
  });
});

// Domains whose lines have no price-list field today.
const NO_FIELD: {
  name: string;
  domain: DomainPlugin;
  options: Record<string, unknown> | null;
}[] = [
  {
    name: "hvac",
    domain: hvacDomain,
    options: {
      systemType: "ducted_residential",
      condition: "MICROBIAL_GROWTH",
    },
  },
  {
    name: "australian-compliance",
    domain: australianComplianceDomain,
    options: null,
  },
];

describe.each(NO_FIELD)(
  "$name domain has no hard-coded rates",
  ({ domain, options }) => {
    it("even with every price-list rate set, each line needs a price-list field and the total is blocked", async () => {
      const est = await estimateFor(domain, options, FULL_PRICE_LIST);
      expect(est.lines.length).toBeGreaterThan(0);
      for (const l of est.lines) {
        expect(l.pricingStatus).toBe("needs_price_list_field");
        expect(l.rate).toBeNull();
        expect(l.lineTotalExGst).toBeNull();
      }
      expect(est.totals.status).toBe("blocked");
      expect(est.totals.totalIncGst).toBeNull();
    });
  },
);

// Review round 2 (P1-AREA-UNIT-PRICING): affectedSquareFootage is square feet.
// A 20 m2 job dual-writes 215.28 sq ft; reading that column as m2 priced it
// 10.76 times over. The same area must give the same estimate however the
// row stores it, and per-m2 lines must carry 20, not 215.28.
const AREA_SCENARIOS: {
  name: string;
  domain: DomainPlugin;
  options: Record<string, unknown> | null;
}[] = [
  { name: "water", domain: waterDomain, options: null },
  {
    name: "mould",
    domain: mouldDomain,
    options: { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
  },
  {
    name: "storm",
    domain: stormDomain,
    options: { entryType: "roof_penetration", waterCategory: 2 },
  },
  {
    name: "biohazard",
    domain: biohazardDomain,
    options: { biohazardType: "sewage_overflow" },
  },
];

async function estimateWithAreas(
  domain: DomainPlugin,
  options: Record<string, unknown> | null,
  affectedAreas: Record<string, number>[],
) {
  inspectionFindUnique.mockResolvedValue({ ...INSPECTION, affectedAreas });
  return estimateFor(domain, options, FULL_PRICE_LIST);
}

describe.each(AREA_SCENARIOS)(
  "$name domain reads the affected area in m2, never the sq-ft column as m2",
  ({ domain, options }) => {
    it("a dual-written row, an m2-only row and a legacy sq-ft-only row give the same estimate", async () => {
      const metricOnly = await estimateWithAreas(domain, options, [
        { affectedAreaSqm: 20 },
      ]);
      const dual = await estimateWithAreas(domain, options, [
        { affectedAreaSqm: 20, affectedSquareFootage: sqmToSqft(20) },
      ]);
      const legacy = await estimateWithAreas(domain, options, [
        { affectedSquareFootage: sqmToSqft(20) },
      ]);
      expect(dual.lines.length).toBeGreaterThan(0);
      expect(dual).toEqual(metricOnly);
      expect(legacy.lines.length).toBe(metricOnly.lines.length);
      legacy.lines.forEach((l, i) => {
        const m = metricOnly.lines[i];
        expect(l.description).toBe(m.description);
        expect(l.quantity as number).toBeCloseTo(m.quantity as number, 6);
        if (m.lineTotalExGst === null) expect(l.lineTotalExGst).toBeNull();
        else expect(l.lineTotalExGst as number).toBeCloseTo(m.lineTotalExGst, 2);
      });
      for (const l of dual.lines) {
        if (l.unit === "m²") {
          expect(l.quantity as number).toBeLessThanOrEqual(20 + 1e-9);
        }
      }
    });
  },
);

describe("biohazard sanitation is priced on 20 m2, not 215.28 (review round 2)", () => {
  it("quantity 20 at the contractor's treatment rate", async () => {
    const est = await estimateWithAreas(
      biohazardDomain,
      { biohazardType: "sewage_overflow" },
      [{ affectedAreaSqm: 20, affectedSquareFootage: sqmToSqft(20) }],
    );
    const rate = FULL_PRICE_LIST.biohazardTreatmentRate;
    const perM2 = est.lines.filter(
      (l) => l.unit === "m²" && l.rate === rate && l.pricingStatus === "priced",
    );
    expect(perM2.length).toBeGreaterThan(0);
    for (const l of perM2) {
      expect(l.quantity).toBeCloseTo(20, 6);
      expect(l.lineTotalExGst as number).toBeCloseTo(20 * rate, 2);
    }
  });
});
