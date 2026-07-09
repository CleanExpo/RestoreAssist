import { describe, it, expect } from "vitest";
import {
  PRICING_HINT,
  formatOrgPricingBlock,
  getEffectiveOrgPricing,
  buildPricingGrounding,
  type OrgPricingRates,
  type OrgPricingReader,
} from "../org-pricing";

const SAMPLE: OrgPricingRates = {
  labourerNormalHours: 70,
  qualifiedTechnicianNormalHours: 85,
  masterQualifiedNormalHours: 110,
  airMoverAxialDailyRate: 45,
  airMoverCentrifugalDailyRate: 65,
  dehumidifierLGRDailyRate: 120,
  dehumidifierDesiccantDailyRate: 250,
  afdUnitLargeDailyRate: 150,
  negativeAirMachineDailyRate: 175,
  hepaVacuumDailyRate: 95,
  administrationFee: 165,
  callOutFee: 245,
  mobilisationFee: 185,
  thermalCameraUseCostPerAssessment: 145,
  afterHoursMultiplier: 1.5,
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2.0,
  publicHolidayMultiplier: 2.5,
};

/** Stub Prisma that returns a fixed row (or null) without a real DB. */
function stubReader(row: OrgPricingRates | null): OrgPricingReader {
  return {
    organizationPricingConfig: {
      findUnique: async () => row,
    },
  } as unknown as OrgPricingReader;
}

describe("PRICING_HINT", () => {
  const hits = [
    "what should I charge for an air scrubber?",
    "air mover day rate?",
    "how much do I charge for labour",
    "what's the call-out fee",
    "after-hours rate for a tech",
    "give me a quote for drying",
    "$/hr for a labourer",
    "per day for a dehumidifier",
    "what are my rates",
    "how should I price this job",
  ];
  it.each(hits)("fires on %j", (q) => {
    expect(PRICING_HINT.test(q)).toBe(true);
  });

  const misses = [
    "how's the weather today",
    "what's the drying standard for Category 2",
    "tell me about mould remediation",
    "should I accelerate the airflow", // 'rate' inside 'accelerate' must NOT match
    "generate a report", // 'rate' inside 'generate' must NOT match
    "book me a flight",
  ];
  it.each(misses)("does not fire on %j", (q) => {
    expect(PRICING_HINT.test(q)).toBe(false);
  });
});

describe("formatOrgPricingBlock", () => {
  it("returns an imperative setup nudge with no dollar figure when not configured", () => {
    const block = formatOrgPricingBlock(null);
    expect(block).toContain("not configured");
    expect(block).toContain("Settings → Pricing");
    expect(block).toMatch(/do not quote|not quote a specific/i);
    // no digits => cannot leak a fabricated rate
    expect(block).not.toMatch(/\d/);
  });

  it("renders the contractor's configured rates and the use-only instruction", () => {
    const block = formatOrgPricingBlock(SAMPLE);
    expect(block).toContain("labourer 70");
    expect(block).toContain("qualified technician 85");
    expect(block).toContain("master/senior technician 110");
    expect(block).toContain("AFD/air scrubber 150");
    expect(block).toContain("negative-air machine 175");
    expect(block).toContain("HEPA vacuum 95");
    expect(block).toContain("after-hours ×1.5");
    expect(block).toContain("public holiday ×2.5");
    expect(block).toMatch(/ONLY these rates/);
  });

  it("omits nullable equipment/fees that are not set", () => {
    const partial: OrgPricingRates = {
      ...SAMPLE,
      negativeAirMachineDailyRate: null,
      hepaVacuumDailyRate: null,
      mobilisationFee: null,
    };
    const block = formatOrgPricingBlock(partial);
    expect(block).not.toContain("negative-air machine");
    expect(block).not.toContain("HEPA vacuum");
    expect(block).not.toContain("mobilisation");
    // configured rates still present
    expect(block).toContain("AFD/air scrubber 150");
  });
});

describe("getEffectiveOrgPricing", () => {
  it("returns null for a null/empty organizationId without touching the DB", async () => {
    let called = false;
    const reader = {
      organizationPricingConfig: {
        findUnique: async () => {
          called = true;
          return SAMPLE;
        },
      },
    } as unknown as OrgPricingReader;
    expect(await getEffectiveOrgPricing(reader, null)).toBeNull();
    expect(await getEffectiveOrgPricing(reader, undefined)).toBeNull();
    expect(await getEffectiveOrgPricing(reader, "")).toBeNull();
    expect(called).toBe(false);
  });

  it("returns the row for a present organizationId", async () => {
    expect(await getEffectiveOrgPricing(stubReader(SAMPLE), "org_1")).toEqual(
      SAMPLE,
    );
  });
});

describe("buildPricingGrounding", () => {
  it("returns '' when the message is not a pricing question", async () => {
    const out = await buildPricingGrounding(
      stubReader(SAMPLE),
      "org_1",
      "what's the drying standard?",
    );
    expect(out).toBe("");
  });

  it("injects the configured-rates block on a pricing question", async () => {
    const out = await buildPricingGrounding(
      stubReader(SAMPLE),
      "org_1",
      "what should I charge for an air scrubber?",
    );
    expect(out).toContain("AFD/air scrubber 150");
    expect(out).toMatch(/ONLY these rates/);
  });

  it("injects the setup nudge (not a rate) when the org has no pricing row", async () => {
    const out = await buildPricingGrounding(
      stubReader(null),
      "org_1",
      "what should I charge for labour?",
    );
    expect(out).toContain("Settings → Pricing");
    expect(out).not.toMatch(/\d/);
  });

  it("returns '' (never throws) when the reader errors", async () => {
    const boom = {
      organizationPricingConfig: {
        findUnique: async () => {
          throw new Error("db down");
        },
      },
    } as unknown as OrgPricingReader;
    const out = await buildPricingGrounding(boom, "org_1", "what are my rates?");
    expect(out).toBe("");
  });
});

// CI-parity: validate the select compiles against the LIVE Prisma schema (mock
// tests above can't catch a renamed column). findUnique on an unknown org still
// exercises the field list. Skips locally without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("getEffectiveOrgPricing (DB)", () => {
  it("resolves null for an unknown organizationId against the real schema", async () => {
    const { prisma } = await import("@/lib/prisma");
    const out = await getEffectiveOrgPricing(
      prisma,
      "org_does_not_exist_ra7026",
    );
    expect(out).toBeNull();
  });
});
