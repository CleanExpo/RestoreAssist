/**
 * RA-8281 B1 — a price-list rate the contractor has not set is never priced
 * at $0. Two guards:
 *   1. the helpers throw / report instead of returning a number;
 *   2. no changed reader coerces a rate field to 0 with `?? 0` or `|| 0`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASE_RATE_FIELDS,
  RateNotSetError,
  assertRatesSet,
  requireRate,
  unsetRates,
} from "@/lib/pricing/rate-not-set";
import { getEquipmentDailyRate } from "@/lib/equipment-matrix";
import { estimateCosts } from "@/lib/nir-cost-estimation";

describe("requireRate", () => {
  it("returns a set rate", () => {
    expect(requireRate({ callOutFee: 150 }, "callOutFee")).toBe(150);
  });

  it.each([null, undefined, Number.NaN])(
    "throws RateNotSetError for %s, never 0",
    (v) => {
      expect(() => requireRate({ callOutFee: v }, "callOutFee")).toThrow(
        RateNotSetError,
      );
    },
  );

  it("names the national range when NRPG has one", () => {
    expect(() =>
      requireRate(
        { dehumidifierLGRDailyRate: null },
        "dehumidifierLGRDailyRate",
      ),
    ).toThrow(/Rate not set.*national range \$\d/);
  });

  it("names no range for a field NRPG has no range for", () => {
    try {
      requireRate({ rateFireDebrisRemoval: null }, "rateFireDebrisRemoval");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/Rate not set/);
      expect((e as Error).message).not.toMatch(/national range/);
    }
  });
});

describe("unsetRates / assertRatesSet", () => {
  it("lists every unset field", () => {
    const unset = unsetRates({ callOutFee: 1, administrationFee: null }, [
      "callOutFee",
      "administrationFee",
      "labourerNormalHours",
    ]);
    expect(unset.map((u) => u.field)).toEqual([
      "administrationFee",
      "labourerNormalHours",
    ]);
  });

  it.each([null, undefined])(
    "a missing price list (%s) reports every rate unset instead of crashing",
    (config) => {
      expect(() => assertRatesSet(config, ["callOutFee"])).toThrow(
        RateNotSetError,
      );
      expect(() => requireRate(config, "callOutFee")).toThrow(RateNotSetError);
      expect(unsetRates(config, ["callOutFee"]).map((u) => u.field)).toEqual([
        "callOutFee",
      ]);
    },
  );

  it("assertRatesSet passes a complete list and throws on a gap", () => {
    const full = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 10]));
    expect(() => assertRatesSet(full, BASE_RATE_FIELDS)).not.toThrow();
    expect(() =>
      assertRatesSet({ ...full, callOutFee: null }, BASE_RATE_FIELDS),
    ).toThrow(RateNotSetError);
  });
});

describe("getEquipmentDailyRate", () => {
  it("throws for an unset rate on a price list, never 0", () => {
    expect(() =>
      getEquipmentDailyRate("lgr-85", { dehumidifierLGRDailyRate: null }),
    ).toThrow(RateNotSetError);
  });

  it("control: returns the contractor's own rate", () => {
    expect(
      getEquipmentDailyRate("lgr-85", { dehumidifierLGRDailyRate: 61 }),
    ).toBe(61);
  });
});

describe("NIR estimateCosts", () => {
  const scope = [
    { itemType: "install_dehumidification", description: "LGR", quantity: 2 },
  ];
  const full = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 60]));

  it("an unset rate on a price list throws RateNotSetError, never a midpoint or $0", async () => {
    await expect(
      estimateCosts(scope, null, {
        ...full,
        dehumidifierLGRDailyRate: null,
      } as never),
    ).rejects.toBeInstanceOf(RateNotSetError);
  });

  it("control: a set rate prices at the contractor's own rate", async () => {
    const est = await estimateCosts(scope, null, full as never);
    expect(est.items[0].rate).toBe(60);
  });
});

const FIRE_FIELDS = [
  "rateFireRestoration",
  "rateOzoneGenerator",
  "rateHydroxylUnit",
  "rateContentsClean",
  "rateFireEnzymeAdditionalPass",
  "rateFireSolventClean",
  "rateFireDeodorisation",
  "rateFireWallCeilingWash",
  "rateFireWindowTrackClean",
  "rateFireCupboardBenchClean",
  "rateCarpetClean",
  "rateSoftFurnishingClean",
  "rateHvacDuctClean",
  "rateLightFittingClean",
  "rateStructuralAssessment",
  "rateFireDebrisRemoval",
];

/** Readers changed in RA-8281 B1. */
export const RATE_READERS = [
  "lib/nir-cost-estimation.ts",
  "lib/equipment-matrix.ts",
  "lib/billing/rate-engine.ts",
  "lib/pricing/org-pricing.ts",
  "lib/pricing/rate-not-set.ts",
  "lib/restoration/cost-estimation-builder.ts",
  "lib/restoration/scope-of-works-builder.ts",
  "lib/scope-mould.ts",
  "lib/scope-storm.ts",
  "lib/scope-biohazard.ts",
  "lib/scope-fire.ts",
  "app/api/calculate/route.ts",
  "app/api/inspections/[id]/cost-estimates/route.ts",
  "app/api/inspections/[id]/submit/route.ts",
  "app/api/reports/generate-cost-estimation/route.ts",
  "app/api/reports/generate-scope-of-works/route.ts",
  "components/EquipmentToolsSelection.tsx",
  "components/PricingConfiguration.tsx",
  "components/setup/PricingCard.tsx",
  "lib/pricing/rate-input.ts",
];

const RATE_NAMES = [...BASE_RATE_FIELDS, ...FIRE_FIELDS, "dailyRate"];
const ZERO_COERCION = new RegExp(
  String.raw`(?:\b(?:${RATE_NAMES.join("|")})\b\)?|(?:rates|config|pricingConfig|priceList)\[[^\]]+\])\s*(?:\?\?|\|\|)\s*0(?![.\d])`,
);

/**
 * Scan the whole source, not line by line: a coercion split across a line
 * break (`rates.callOutFee` newline `?? 0`) must still be caught. Returns the
 * 1-based line of each hit.
 */
function scanHits(src: string, pattern: RegExp): number[] {
  const global = new RegExp(pattern.source, "g");
  return [...src.matchAll(global)].map(
    (m) => src.slice(0, m.index).split("\n").length,
  );
}

/**
 * A cached selection rate preferred over the current price list
 * (`sel.dailyRate || getEquipmentDailyRate(...)`) skips the unset-rate check
 * when the contractor later clears that rate (RA-8281 review round 1).
 */
const CACHED_RATE_FALLBACK = /\bdailyRate\s*\|\|/;

describe("no changed reader coerces a rate field to 0", () => {
  it.each(RATE_READERS)("%s", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(scanHits(src, ZERO_COERCION)).toEqual([]);
  });

  it.each(RATE_READERS)(
    "%s prefers no cached rate over the price list",
    (file) => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(scanHits(src, CACHED_RATE_FALLBACK)).toEqual([]);
    },
  );

  it("control: the pattern catches a planted coercion", () => {
    expect(ZERO_COERCION.test("rate: config.callOutFee ?? 0,")).toBe(true);
    expect(
      ZERO_COERCION.test("pricingConfig.dehumidifierLGRDailyRate || 0"),
    ).toBe(true);
    expect(ZERO_COERCION.test("rate = rates[config.nrpgField] ?? 0;")).toBe(
      true,
    );
    expect(ZERO_COERCION.test("const x = callOutFee ?? 0.5")).toBe(false);
  });

  it("control: a coercion split across a line break is caught, on its line", () => {
    const src = "const a = 1;\nconst probe = rates.callOutFee\n  ?? 0;\n";
    expect(scanHits(src, ZERO_COERCION)).toEqual([2]);
  });

  it("control: a cached rate fallback is caught, split or not", () => {
    expect(
      scanHits("x = sel.dailyRate || get(id, cfg);", CACHED_RATE_FALLBACK),
    ).toEqual([1]);
    expect(
      scanHits(
        "x =\n  sel.dailyRate\n  || get(id, cfg);",
        CACHED_RATE_FALLBACK,
      ),
    ).toEqual([2]);
  });
});

describe("price-list screen inputs (RA-8281 B1)", () => {
  it("a blank or non-numeric rate input stays unset, never 0", async () => {
    const { parseRateInput } = await import("@/lib/pricing/rate-input");
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("   ")).toBeNull();
    expect(parseRateInput("abc")).toBeNull();
    expect(parseRateInput("-5")).toBeNull();
  });

  it("control: a typed rate is kept, including a deliberate 0 (a waived fee)", async () => {
    const { parseRateInput } = await import("@/lib/pricing/rate-input");
    expect(parseRateInput("61.5")).toBe(61.5);
    expect(parseRateInput("0")).toBe(0);
  });

  it("an unset rate renders as an empty input, not 0", async () => {
    const { rateInputValue } = await import("@/lib/pricing/rate-input");
    expect(rateInputValue(null)).toBe("");
    expect(rateInputValue(undefined)).toBe("");
    expect(rateInputValue(61)).toBe(61);
  });

  const screen = readFileSync(
    join(process.cwd(), "components/PricingConfiguration.tsx"),
    "utf8",
  );

  it("every rate input on the price-list screen renders through rateInputValue", () => {
    const raw = screen.match(/value=\{formData\.\w+\}/g) ?? [];
    expect(raw).toEqual([]);
    expect(screen).toMatch(/value=\{rateInputValue\(formData\.\w+\)\}/);
  });

  it("typing into a rate input parses through parseRateInput, not parseFloat || 0", () => {
    const handler = screen.slice(
      screen.indexOf("const handleInputChange"),
      screen.indexOf("const renderCustomFields"),
    );
    expect(handler).toContain("parseRateInput(");
    expect(handler).not.toMatch(/\|\|\s*0/);
  });

  it("the setup card does not save a blank rate as 0", () => {
    const card = readFileSync(
      join(process.cwd(), "components/setup/PricingCard.tsx"),
      "utf8",
    );
    const blur = card.slice(
      card.indexOf("const handleBlur"),
      card.indexOf("const rows"),
    );
    expect(blur).toContain("parseRateInput(");
    expect(blur).not.toMatch(/Number\(raw\)/);
  });
});

describe("each changed reader blocks an unset rate (RA-8281 B1)", () => {
  const FULL = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 70]));

  it("Margot's price block says 'not set' for an unset rate, never a figure", async () => {
    const { formatOrgPricingBlock } = await import("@/lib/pricing/org-pricing");
    const block = formatOrgPricingBlock({
      ...FULL,
      callOutFee: null,
      negativeAirMachineDailyRate: null,
      hepaVacuumDailyRate: null,
      mobilisationFee: null,
      afterHoursMultiplier: 1.5,
      saturdayMultiplier: 1.5,
      sundayMultiplier: 2,
      publicHolidayMultiplier: 2.5,
    } as never);
    expect(block).toContain(
      "call-out not set (do not quote a figure for this)",
    );
    expect(block).toContain("administration 70");
  });

  it("the rate engine throws for an unset price-list rate instead of falling back", async () => {
    const { lookupRate } = await import("@/lib/billing/rate-engine");
    const prisma = {
      user: { findUnique: async () => ({ organizationId: "org_1" }) },
      organizationPricingConfig: {
        findUnique: async () => ({ ...FULL, callOutFee: null }),
      },
    };
    await expect(
      lookupRate(prisma as never, { userId: "u_1", field: "callOutFee" }),
    ).rejects.toBeInstanceOf(RateNotSetError);
    const ok = await lookupRate(prisma as never, {
      userId: "u_1",
      field: "administrationFee",
    });
    expect(ok?.value).toBe(70);
  });

  it("the cost-estimation report builder refuses an unset rate", async () => {
    const { buildCostEstimationData, COST_ESTIMATION_RATE_FIELDS } =
      await import("@/lib/restoration/cost-estimation-builder");
    const { getGstTreatment } = await import("@/lib/gst-rules");
    const pricingConfig = Object.fromEntries(
      COST_ESTIMATION_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig[COST_ESTIMATION_RATE_FIELDS[0]] = null as never;
    expect(() =>
      buildCostEstimationData({
        report: { id: "r", reportNumber: "RA-1", inspection: null },
        analysis: null,
        tier1: null,
        tier2: null,
        tier3: null,
        pricingConfig,
        stateInfo: null,
        scopeData: null,
        gstTreatment: getGstTreatment("AU"),
      }),
    ).toThrow(RateNotSetError);
  });

  it("the scope-of-works report builder refuses an unset rate", async () => {
    const { buildScopeOfWorksData, SCOPE_OF_WORKS_RATE_FIELDS } =
      await import("@/lib/restoration/scope-of-works-builder");
    const pricingConfig = Object.fromEntries(
      SCOPE_OF_WORKS_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig[SCOPE_OF_WORKS_RATE_FIELDS[0]] = null as never;
    expect(() =>
      buildScopeOfWorksData({
        report: { id: "r", reportNumber: "RA-1", inspection: null },
        analysis: null,
        tier1: null,
        tier2: null,
        tier3: null,
        pricingConfig,
        stateInfo: null,
      }),
    ).toThrow(RateNotSetError);
  });

  it("the equipment screen reads an unset rate as null, a set one as itself", async () => {
    const { getEquipmentDailyRateOrNull } =
      await import("@/lib/equipment-matrix");
    expect(
      getEquipmentDailyRateOrNull("lgr-85", { dehumidifierLGRDailyRate: null }),
    ).toBeNull();
    expect(
      getEquipmentDailyRateOrNull("lgr-85", { dehumidifierLGRDailyRate: 61 }),
    ).toBe(61);
  });
});

describe("a cached equipment rate never bypasses the current price list (RA-8281 review)", () => {
  const LGR = [{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }];

  it("totals refuse a selection whose price-list rate is now unset", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/equipment-matrix");
    expect(() =>
      calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: null }),
    ).toThrow(RateNotSetError);
  });

  it("totals price at the current price-list rate, not the cached one", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/equipment-matrix");
    expect(calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: 70 })).toBe(
      70,
    );
  });

  it("control: a deliberate current 0 stays a set rate", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/equipment-matrix");
    expect(calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: 0 })).toBe(
      0,
    );
  });

  it("the cost report refuses cached equipment whose rate is now unset", async () => {
    const { buildCostEstimationData, COST_ESTIMATION_RATE_FIELDS } =
      await import("@/lib/restoration/cost-estimation-builder");
    const { getGstTreatment } = await import("@/lib/gst-rules");
    const pricingConfig: Record<string, number | null> = Object.fromEntries(
      COST_ESTIMATION_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig.dehumidifierLGRDailyRate = null;
    expect(() =>
      buildCostEstimationData({
        report: { id: "r", reportNumber: "RA-1", inspection: null },
        analysis: null,
        tier1: null,
        tier2: null,
        tier3: null,
        pricingConfig,
        stateInfo: null,
        scopeData: null,
        equipmentSelection: LGR,
        gstTreatment: getGstTreatment("AU"),
      }),
    ).toThrow(RateNotSetError);
  });

  it("the scope of works refuses cached equipment whose rate is now unset", async () => {
    const { buildScopeOfWorksData, SCOPE_OF_WORKS_RATE_FIELDS } =
      await import("@/lib/restoration/scope-of-works-builder");
    const pricingConfig: Record<string, number | null> = Object.fromEntries(
      SCOPE_OF_WORKS_RATE_FIELDS.map((f) => [f, 70]),
    );
    // Desiccant is not in SCOPE_OF_WORKS_RATE_FIELDS, so only the equipment
    // path can catch it.
    pricingConfig.dehumidifierDesiccantDailyRate = null;
    expect(() =>
      buildScopeOfWorksData({
        report: { id: "r", reportNumber: "RA-1", inspection: null },
        analysis: null,
        tier1: null,
        tier2: null,
        tier3: null,
        pricingConfig,
        stateInfo: null,
        equipmentSelection: [
          { groupId: "desiccant-20", quantity: 1, dailyRate: 61 },
        ],
      }),
    ).toThrow(RateNotSetError);
  });
});
