/**
 * RA-8281 — every generator line that reads a rate from the price list
 * names that same field in `rateField`, so the assessment domains price
 * it from the contractor's own value. A tag pointing at the wrong field
 * would price the line from a different rate.
 */
import { describe, expect, it } from "vitest";
import type { CompanyPricingRates } from "@/lib/nir-cost-estimation";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { generateMouldScope, type ContaminationClass } from "@/lib/scope-mould";
import { generateStormScope, type StormEntryType } from "@/lib/scope-storm";
import {
  generateBiohazardScope,
  type BiohazardType,
} from "@/lib/scope-biohazard";
import type { ScopeItemDraft } from "@/lib/scope-fire";
import { generatePrelims } from "@/lib/scope-prelims";
import { unitMatchesField } from "@/lib/assessments/price-list-estimate";

// Every field a distinct value, so a mismatched tag cannot match by chance.
const CONFIG = Object.fromEntries(
  Object.keys(NRPG_RATE_RANGES).map((field, i) => [field, 1000 + i]),
) as unknown as CompanyPricingRates;

function expectTagsMatch(drafts: ScopeItemDraft[]) {
  const tagged = drafts.filter((d) => d.rateField);
  expect(tagged.length).toBeGreaterThan(0);
  for (const d of tagged) {
    expect(d.unitCostAud).toBe(
      (CONFIG as unknown as Record<string, number>)[d.rateField as string],
    );
    // A tag is only valid when the line's unit is the unit the field is
    // priced in (no hourly rate x m², no daily rate x once-per-job).
    expect(
      unitMatchesField(d.unit ?? "", d.rateField as string),
      `${d.description}: unit ${d.unit} vs ${d.rateField}`,
    ).toBe(true);
  }
}

describe("prelims tags are priced in the line's own unit", () => {
  it("every tagged prelims line has a unit its field can price", () => {
    const drafts = generatePrelims({
      damageType: "water_damage",
      affectedAreaM2: 40,
      estimatedDays: 5,
      pricingConfig: CONFIG,
    });
    const tagged = drafts.filter((d) => d.rateField);
    expect(tagged.map((d) => d.rateField).sort()).toEqual([
      "mobilisationFee",
      "monitoringVisitDailyRate",
    ]);
    for (const d of tagged) {
      expect(unitMatchesField(d.unit ?? "", d.rateField as string)).toBe(true);
    }
  });
});

describe("rateField tags match the field each generator reads", () => {
  it.each([1, 2, 3, 4] as ContaminationClass[])("mould class %s", (c) => {
    expectTagsMatch(
      generateMouldScope({
        contaminationClass: c,
        affectedAreaM2: 40,
        estimatedDays: 5,
        hvacInvolved: true,
        pricingConfig: CONFIG,
      }),
    );
  });

  it.each([
    "roof_penetration",
    "stormwater_ingress",
    "wind_driven_rain",
    "flash_flood",
  ] as StormEntryType[])("storm %s", (entryType) => {
    for (const waterCategory of [1, 2, 3] as const) {
      expectTagsMatch(
        generateStormScope({
          entryType,
          waterCategory,
          affectedAreaM2: 40,
          estimatedDays: 5,
          pricingConfig: CONFIG,
        }),
      );
    }
  });

  it.each([
    "sewage_overflow",
    "decomposition",
    "chemical_spill",
    "blood_trauma",
  ] as BiohazardType[])("biohazard %s", (biohazardType) => {
    expectTagsMatch(
      generateBiohazardScope({
        biohazardType,
        affectedAreaM2: 40,
        state: "QLD",
        pricingConfig: CONFIG,
      }),
    );
  });
});
