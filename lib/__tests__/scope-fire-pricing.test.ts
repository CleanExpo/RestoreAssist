/**
 * RA-8275 guard tests for fire and smoke scope pricing.
 *
 * On origin/main a light protein-smoke house (800 m², char 1) priced at
 * $118,360 inc GST: both enzyme passes were billed at the mould remediation
 * rate ($65/m²) and ozone priced at $0 because it had no rate.
 *
 * Founder rule: "NRPG Contractors use National Price Averages". RestoreAssist
 * never sets a price. Each line reads one named field from the contractor's
 * own price list, and that value must sit inside the NRPG national range
 * (lib/nrpg-rate-ranges.ts). These tests pin:
 *   - which price-list field each line reads, never a mould field;
 *   - every priced line's rate equals the contractor's value and is in range;
 *   - an unset field, an out-of-range value, a line with no price-list field
 *     or a missing quantity blocks the total; none is ever $0;
 *   - the ticket's job lines exist, with surfaces split from contents;
 *   - light, medium and heavy protein smoke scale the enzyme passes.
 * No test asserts an expected dollar total: that depends on each company.
 */

import { describe, it, expect } from "vitest";
import {
  generateFireScope,
  priceFireScope,
  FIRE_PRICING_BASIS,
  type FireJobInputs,
  type ScopeItemDraft,
} from "../scope-fire";
import { getGstTreatment } from "../gst-rules";
import { getFieldRange } from "../nrpg-rate-ranges";

const AU = getGstTreatment("AU");

/** The exact pricing config from the RA-8275 reproduction. */
const TICKET_REPRO_PRICING = {
  antimicrobialTreatmentRate: 4.5,
  mouldRemediationTreatmentRate: 65,
};

/**
 * A contractor price list. Each value is inside its NRPG range and distinct
 * from every other, so a line reading the wrong field is caught. These are
 * test fixtures, not recommended rates. The rate* keys model fields that
 * have an NRPG range today but no price-list column yet.
 */
const CONTRACTOR_PRICE_LIST: Record<string, number> = {
  qualifiedTechnicianNormalHours: 91,
  masterQualifiedNormalHours: 121,
  afdUnitLargeDailyRate: 61,
  hepaVacuumDailyRate: 57,
  callOutFee: 151,
  administrationFee: 201,
  rateFireRestoration: 97,
  rateOzoneGenerator: 111,
  rateHydroxylUnit: 113,
  rateContentsClean: 53,
  // Fields a fire line must never read:
  mouldRemediationTreatmentRate: 66,
  antimicrobialTreatmentRate: 6,
  biohazardTreatmentRate: 18,
};

const FORBIDDEN_FIELDS = [
  "mouldRemediationTreatmentRate",
  "antimicrobialTreatmentRate",
  "biohazardTreatmentRate",
  "rateMouldRemediation",
  "rateBiohazardClean",
];

const FULL_JOB: FireJobInputs = {
  severity: "medium",
  contentsItemCount: 120,
  windowCount: 18,
  cupboardBenchAreaM2: 30,
  carpetAreaM2: 90,
  softFurnishingCount: 6,
  hvacSystemCount: 1,
  lightFittingCount: 24,
  hepaVacuumUnitDays: 3,
  ozoneUnitDays: 2,
  hydroxylUnitDays: 2,
};

/** RA-8275 contractor shape: 3 building + 4 contents days, 4 techs + 1 supervisor, 4 air scrubbers. */
const LABOUR_JOB: FireJobInputs = {
  ...FULL_JOB,
  severity: "light",
  technicians: 4,
  supervisors: 1,
  buildingDays: 3,
  contentsDays: 4,
  airScrubbers: 4,
};

/** Every priced line reads its own field, and the value sits in its NRPG range. */
function expectPricedFromOwnFieldInRange(
  items: ScopeItemDraft[],
  config: Record<string, number>,
) {
  for (const item of items) {
    if (item.pricingStatus !== "priced") continue;
    expect(item.rateField, item.itemType).toBeDefined();
    const field = item.rateField as string;
    expect(FORBIDDEN_FIELDS).not.toContain(field);
    expect(item.unitCostAud, item.itemType).toBe(config[field]);
    const range = getFieldRange(field);
    expect(range, `${field} has an NRPG range`).toBeDefined();
    expect(item.unitCostAud).toBeGreaterThanOrEqual(range!.min);
    expect(item.unitCostAud).toBeLessThanOrEqual(range!.max);
  }
}

describe("RA-8275 — protein smoke never uses the mould rate", () => {
  it("ticket reproduction: no line is priced at the $65 mould rate", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 800,
      pricingConfig: TICKET_REPRO_PRICING,
    });
    const enzyme = items.filter((i) => i.itemType.startsWith("enzyme_"));
    expect(enzyme.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.unitCostAud).not.toBe(65);
      expect(item.unitCostAud).not.toBe(4.5);
    }
    // With no fire rate in the contractor's list, enzyme is visibly unpriced.
    for (const item of enzyme) {
      expect(item.unitCostAud).toBeUndefined();
      expect(item.pricingStatus).not.toBe("priced");
    }
  });

  it("the primary protein clean reads rateFireRestoration, not a mould field", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 10,
      pricingConfig: CONTRACTOR_PRICE_LIST,
    });
    const pass1 = items.find((i) => i.itemType === "enzyme_treatment_1");
    expect(pass1?.rateField).toBe("rateFireRestoration");
    expect(pass1?.unitCostAud).toBe(97);
  });

  it("no line of any smoke type reads a mould, antimicrobial or biohazard field", () => {
    for (const smokeType of ["wet", "dry", "protein", "fuel_oil"] as const) {
      const items = generateFireScope({
        smokeType,
        charLevel: 4,
        affectedAreaM2: 100,
        pricingConfig: CONTRACTOR_PRICE_LIST,
        job: LABOUR_JOB,
      });
      for (const item of items) {
        if (item.rateField)
          expect(FORBIDDEN_FIELDS).not.toContain(item.rateField);
        expect([66, 6, 18]).not.toContain(item.unitCostAud);
      }
    }
  });
});

describe("RA-8275 — each line uses the contractor's own field, inside its NRPG range", () => {
  it("area-priced job: every priced line matches its field and range", () => {
    for (const smokeType of ["wet", "dry", "protein", "fuel_oil"] as const) {
      const items = generateFireScope({
        smokeType,
        charLevel: 3,
        affectedAreaM2: 100,
        pricingConfig: CONTRACTOR_PRICE_LIST,
        job: FULL_JOB,
      });
      expect(items.some((i) => i.pricingStatus === "priced")).toBe(true);
      expectPricedFromOwnFieldInRange(items, CONTRACTOR_PRICE_LIST);
    }
  });

  it("labour-priced job: labour, air scrubbers and fees read their own fields", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 800,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: LABOUR_JOB,
    });
    const field = (t: string) => items.find((i) => i.itemType === t)?.rateField;
    expect(field("labour_technician_hours")).toBe(
      "qualifiedTechnicianNormalHours",
    );
    expect(field("labour_supervisor_hours")).toBe("masterQualifiedNormalHours");
    expect(field("air_scrubber_hire")).toBe("afdUnitLargeDailyRate");
    expect(field("ozone_treatment")).toBe("rateOzoneGenerator");
    expect(field("contents_clean")).toBe("rateContentsClean");
    expect(field("call_out_fee")).toBe("callOutFee");
    expect(field("administration_fee")).toBe("administrationFee");

    const tech = items.find((i) => i.itemType === "labour_technician_hours");
    expect(tech?.quantity).toBe(4 * 7 * 8);
    expect(
      items.find((i) => i.itemType === "labour_supervisor_hours")?.quantity,
    ).toBe(56);
    expect(
      items.find((i) => i.itemType === "air_scrubber_hire")?.quantity,
    ).toBe(28);

    // Cleaning tasks are carried by labour hours, not charged twice.
    const wash = items.find((i) => i.itemType === "wall_ceiling_wash");
    expect(wash?.pricingStatus).toBe("included_in_labour");
    expect(wash?.unitCostAud).toBeUndefined();

    expectPricedFromOwnFieldInRange(items, CONTRACTOR_PRICE_LIST);
    const priced = priceFireScope(items, AU);
    expect(priced.status).toBe("complete");
    expect(priced.basis).toBe(FIRE_PRICING_BASIS);
  });

  it("a value outside the NRPG range is not used and blocks the total", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: { ...CONTRACTOR_PRICE_LIST, rateOzoneGenerator: 500 },
      job: LABOUR_JOB,
    });
    const ozone = items.find((i) => i.itemType === "ozone_treatment");
    expect(ozone?.pricingStatus).toBe("rate_out_of_range");
    expect(ozone?.unitCostAud).toBeUndefined();
    expect(ozone?.pricingNote).toContain("$75-$165");
    expect(priceFireScope(items, AU).status).toBe("blocked");
  });
});

describe("RA-8275 — a missing rate blocks the total and is never $0", () => {
  it("ticket reproduction: total is blocked, not $107,600 and not $0", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 800,
      pricingConfig: TICKET_REPRO_PRICING,
    });
    const priced = priceFireScope(items, AU);
    expect(priced.status).toBe("blocked");
    expect(priced.subtotalExGst).toBeNull();
    expect(priced.gstTotal).toBeNull();
    expect(priced.totalIncGst).toBeNull();
    expect(priced.missing.length).toBeGreaterThan(0);
    expect(priced.missing.map((m) => m.itemType)).toContain("ozone_treatment");
    for (const line of priced.lines) {
      if (line.pricingStatus !== "priced") {
        expect(line.rate).toBeNull();
        expect(line.lineTotalExGst).toBeNull();
      }
    }
  });

  it("an unset field says 'rate not set' with its national range, never a default", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: {},
    });
    const pass1 = items.find((i) => i.itemType === "enzyme_treatment_1");
    expect(pass1?.pricingStatus).toBe("rate_not_set");
    expect(pass1?.unitCostAud).toBeUndefined();
    expect(pass1?.pricingNote).toBe(
      "Rate not set. Set rateFireRestoration in your price list (national range $85-$195 per m²).",
    );
  });

  it("a zero rate is treated as not set, never billed as $0", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 50,
      pricingConfig: { ...CONTRACTOR_PRICE_LIST, callOutFee: 0 },
      job: LABOUR_JOB,
    });
    const fee = items.find((i) => i.itemType === "call_out_fee");
    expect(fee?.pricingStatus).toBe("rate_not_set");
    expect(fee?.unitCostAud).toBeUndefined();
    expect(priceFireScope(items, AU).status).toBe("blocked");
  });

  it("no priced line ever carries a $0 rate", () => {
    const items = generateFireScope({
      smokeType: "wet",
      charLevel: 3,
      affectedAreaM2: 60,
      pricingConfig: TICKET_REPRO_PRICING,
      job: FULL_JOB,
    });
    for (const line of priceFireScope(items, AU).lines) {
      if (line.rate !== null) expect(line.rate).toBeGreaterThan(0);
      if (line.lineTotalExGst !== null)
        expect(line.lineTotalExGst).toBeGreaterThan(0);
    }
  });

  it("a line with no price-list field says so and invents no range", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: FULL_JOB,
    });
    const wash = items.find((i) => i.itemType === "wall_ceiling_wash");
    expect(wash?.pricingStatus).toBe("needs_price_list_field");
    expect(wash?.rateField).toBeUndefined();
    expect(wash?.proposedRateField).toBe("rateFireWallCeilingWash");
    expect(wash?.pricingNote).not.toContain("national range");
    expect(getFieldRange("rateFireWallCeilingWash")).toBeUndefined();
    expect(priceFireScope(items, AU).status).toBe("blocked");
  });

  it("GST on a complete total comes from gst-rules", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: LABOUR_JOB,
    });
    const au = priceFireScope(items, AU);
    if (au.status !== "complete") throw new Error("expected complete");
    const sum = au.lines.reduce((s, l) => s + (l.lineTotalExGst ?? 0), 0);
    expect(au.subtotalExGst).toBeCloseTo(sum, 2);
    expect(au.gstTotal).toBeCloseTo(sum * 0.1, 1);
    expect(au.totalIncGst).toBeCloseTo(sum * 1.1, 1);
    const nz = priceFireScope(items, getGstTreatment("NZ"));
    expect(nz.gstTotal).toBeCloseTo(sum * 0.15, 1);
    expect(nz.currency).toBe("NZD");
  });
});

describe("RA-8275 — the job lines the ticket listed exist", () => {
  const REQUIRED = [
    "wall_ceiling_wash",
    "window_track_clean",
    "cupboard_bench_clean",
    "contents_clean",
    "carpet_clean",
    "soft_furnishing_clean",
    "hvac_duct_clean",
    "light_fitting_clean",
    "call_out_fee",
    "administration_fee",
  ];

  it("every listed line is present for each smoke type", () => {
    for (const smokeType of ["wet", "dry", "protein", "fuel_oil"] as const) {
      const types = generateFireScope({
        smokeType,
        charLevel: 1,
        affectedAreaM2: 100,
        pricingConfig: CONTRACTOR_PRICE_LIST,
        job: FULL_JOB,
      }).map((i) => i.itemType);
      for (const t of REQUIRED) expect(types).toContain(t);
    }
  });

  it("labour hours appear when crew and days are known", () => {
    const types = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: LABOUR_JOB,
    }).map((i) => i.itemType);
    expect(types).toContain("labour_technician_hours");
    expect(types).toContain("labour_supervisor_hours");
  });

  it("a line with no inspection quantity is 'quantity needed', never a guessed quantity", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
    });
    const contents = items.find((i) => i.itemType === "contents_clean");
    expect(contents?.pricingStatus).toBe("quantity_needed");
    expect(contents?.quantity).toBeUndefined();
    const priced = priceFireScope(items, AU);
    expect(priced.status).toBe("blocked");
    expect(
      priced.missing.find((m) => m.itemType === "contents_clean")?.reason,
    ).toBe("quantity_needed");
  });

  it("surfaces and contents are separate groups", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: FULL_JOB,
    });
    const group = (t: string) => items.find((i) => i.itemType === t)?.group;
    expect(group("wall_ceiling_wash")).toBe("surfaces");
    expect(group("enzyme_treatment_1")).toBe("surfaces");
    expect(group("contents_clean")).toBe("contents");
    expect(group("soft_furnishing_clean")).toBe("contents");
    const contents = items.find((i) => i.itemType === "contents_clean");
    expect(contents?.unit).toBe("item");
    expect(contents?.quantity).toBe(120);
    expect(contents?.unitCostAud).toBe(53);
  });
});

describe("RA-8275 — a role with no staff adds no labour line", () => {
  // Review finding (Codex, 8d0f4bb): a job with no supervisor produced a
  // supervisor line with "quantity needed" and blocked a complete total.
  function labourJob(technicians: number, supervisors: number) {
    return generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 100,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: { ...LABOUR_JOB, technicians, supervisors },
    });
  }

  it("no supervisors: no supervisor line, total completes", () => {
    const items = labourJob(2, 0);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("labour_technician_hours");
    expect(types).not.toContain("labour_supervisor_hours");
    expect(priceFireScope(items, AU).status).toBe("complete");
  });

  it("no technicians: no technician line, total completes", () => {
    const items = labourJob(0, 1);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("labour_technician_hours");
    expect(types).toContain("labour_supervisor_hours");
    expect(priceFireScope(items, AU).status).toBe("complete");
  });
});

describe("RA-8275 — light, medium and heavy protein smoke", () => {
  function protein(severity: "light" | "medium" | "heavy") {
    return generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 200,
      pricingConfig: CONTRACTOR_PRICE_LIST,
      job: { ...FULL_JOB, severity },
    });
  }

  it("light: one enzyme pass, no HEPA vacuum", () => {
    const t = protein("light").map((i) => i.itemType);
    expect(t).toContain("enzyme_treatment_1");
    expect(t).not.toContain("enzyme_treatment_2");
    expect(t).not.toContain("hepa_vacuum");
  });

  it("medium: two enzyme passes", () => {
    const t = protein("medium").map((i) => i.itemType);
    expect(t).toContain("enzyme_treatment_1");
    expect(t).toContain("enzyme_treatment_2");
    expect(t).not.toContain("hepa_vacuum");
  });

  it("heavy: two enzyme passes plus HEPA vacuum from hepaVacuumDailyRate", () => {
    const items = protein("heavy");
    const t = items.map((i) => i.itemType);
    expect(t).toContain("enzyme_treatment_2");
    const hepa = items.find((i) => i.itemType === "hepa_vacuum");
    expect(hepa?.rateField).toBe("hepaVacuumDailyRate");
    expect(hepa?.unitCostAud).toBe(57);
  });

  it("the second enzyme pass never reuses the first pass's rate field", () => {
    const pass2 = protein("medium").find(
      (i) => i.itemType === "enzyme_treatment_2",
    );
    expect(pass2?.rateField).toBeUndefined();
    expect(pass2?.proposedRateField).toBe("rateFireEnzymeAdditionalPass");
    expect(pass2?.pricingStatus).toBe("needs_price_list_field");
  });
});
