import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-8281 (B2): the quick quote shows a blocked line for a price-list rate
 * that is not set, instead of refusing the whole price list.
 */

const { userFindUnique, pricing, hiddenRanges } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  pricing: vi.fn(),
  hiddenRanges: new Set<string>(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user_abcd" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: pricing,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
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
import { BASE_RATE_FIELDS } from "@/lib/pricing/rate-not-set";
import { POST } from "../route";

const priceList = (overrides: Record<string, number | null> = {}) => ({
  ...Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 70])),
  ...overrides,
});

const QUOTE = {
  jobType: "water",
  affectedAreaM2: 10,
  numberOfRooms: 1,
  dryingDays: 2,
  labourHours: 3,
  airMoversAxial: 4,
  dehumidifiersLGR: 0,
  includeCallOut: true,
  includeAdminFee: false,
};

function post(body: unknown = QUOTE) {
  return POST(
    new NextRequest("http://localhost/api/calculate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hiddenRanges.clear();
  userFindUnique.mockReset();
  userFindUnique
    .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
    .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
    .mockResolvedValueOnce({
      businessName: "Test Co",
      businessABN: "53 004 085 616",
      businessAddress: "1 St",
      businessPhone: null,
      businessEmail: "a@test.com",
      businessLogo: null,
      organization: { country: "AU" },
    });
});

describe("POST /api/calculate: a rate that is not set (RA-8281 B2)", () => {
  it("shows the blocked line with its national range, beside the priced lines", async () => {
    pricing.mockResolvedValue(priceList({ airMoverAxialDailyRate: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("RATE_NOT_SET");
    const range = NRPG_RATE_RANGES.airMoverAxialDailyRate;
    const byDescription = Object.fromEntries(
      body.blocked.lines.map((l: { description: string }) => [
        l.description,
        l,
      ]),
    );
    expect(byDescription["Air Movers (Axial) — 4 units x 2 days"]).toEqual({
      description: "Air Movers (Axial) — 4 units x 2 days",
      quantity: 8,
      unit: "unit-day",
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "airMoverAxialDailyRate",
      pricingNote: `Rate not set. Set airMoverAxialDailyRate in your price list (national range $${range.min}-$${range.max} per day).`,
      nationalRange: { min: range.min, max: range.max, unit: range.unit },
    });
    expect(
      byDescription[
        "Call-Out Fee — Emergency response and initial site attendance"
      ],
    ).toMatchObject({ rate: 70, subtotal: 70, pricingStatus: "priced" });
    expect(
      byDescription["Labour — Qualified Technician (Normal Hours)"],
    ).toMatchObject({ rate: 70, subtotal: 210, pricingStatus: "priced" });
  });

  it("blocks the total: no subtotal, minimum charge, GST or total is given", async () => {
    pricing.mockResolvedValue(priceList({ airMoverAxialDailyRate: null }));

    const body = await (await post()).json();

    expect(body.blocked.status).toBe("blocked");
    expect(body.blocked.total).toBeNull();
    expect(body.blocked.totalNote).toBe("Total not available: rate not set");
    expect(body.blocked.missing.map((m: { field: string }) => m.field)).toEqual(
      ["airMoverAxialDailyRate"],
    );
    for (const key of [
      "subtotalExGST",
      "gst",
      "totalIncGST",
      "minimumChargeLine",
      "quoteNumber",
      "lineItems",
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("a labour rate that is not set is blocked, never priced at another tier's rate", async () => {
    pricing.mockResolvedValue(
      priceList({ masterQualifiedSunday: null, qualifiedTechnicianNormalHours: 55 }),
    );

    const body = await (
      await post({
        ...QUOTE,
        labourTier: "masterQualified",
        labourPeriod: "Sunday",
      })
    ).json();

    const labour = body.blocked.lines.find((l: { description: string }) =>
      l.description.startsWith("Labour"),
    );
    expect(labour).toMatchObject({
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "masterQualifiedSunday",
    });
    expect(JSON.stringify(body)).not.toContain("165");
  });

  it("an unset rate the quote does not use does not block it", async () => {
    pricing.mockResolvedValue(priceList({ biohazardTreatmentRate: null }));

    const res = await post();

    expect(res.status).toBe(200);
    expect((await res.json()).totalIncGST).toBeGreaterThan(0);
  });

  it("shows no range when the range table has none for the field", async () => {
    hiddenRanges.add("airMoverAxialDailyRate");
    pricing.mockResolvedValue(priceList({ airMoverAxialDailyRate: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    const blocked = body.blocked.lines.find(
      (l: { pricingStatus: string }) => l.pricingStatus === "rate_not_set",
    );
    expect(blocked).toMatchObject({
      rate: null,
      subtotal: null,
      nationalRange: null,
      pricingNote: "Rate not set. Set airMoverAxialDailyRate in your price list.",
    });
    expect(JSON.stringify(body)).not.toContain("national range");
    expect(body.blocked.total).toBeNull();
  });

  it("control: with every rate set the quote is priced at the contractor's rates", async () => {
    pricing.mockResolvedValue(priceList());

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.blocked).toBeUndefined();
    // $70 call-out + 3 hr at $70 + 8 unit-days at $70 + 10 m² at $70.
    expect(
      body.lineItems.reduce(
        (sum: number, l: { subtotal: number }) => sum + l.subtotal,
        0,
      ),
    ).toBe(70 + 210 + 560 + 700);
    expect(body.lineItems.every((l: { rate: number }) => l.rate === 70)).toBe(
      true,
    );
    expect(body.pricingSource).toBe("company_pricing_config");
  });
});
