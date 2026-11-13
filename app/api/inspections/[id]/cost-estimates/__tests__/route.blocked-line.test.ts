import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-8281 (B2): the inspection cost estimate shows a blocked line for a
 * price-list rate that is not set, instead of refusing with a bare error.
 * The real engine (estimateCosts) runs; only its rate lookup is replaced.
 */

const { session, findFirst, transaction, inspectionRates, hiddenRanges } =
  vi.hoisted(() => ({
    session: vi.fn(),
    findFirst: vi.fn(),
    transaction: vi.fn(),
    inspectionRates: vi.fn(),
    hiddenRanges: new Set<string>(),
  }));

vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/pulse/notify-client-change", () => ({
  notifyClientStepChange: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst },
    costEstimate: { findMany: vi.fn() },
    $transaction: transaction,
  },
}));
// A field in `hiddenRanges` reads as having no NRPG national range, the state
// the fire fields are in today. Every other field keeps its real range.
vi.mock("@/lib/nrpg-rate-ranges", async (original) => {
  const actual = await original<typeof import("@/lib/nrpg-rate-ranges")>();
  return {
    ...actual,
    getFieldRange: (field: string) =>
      hiddenRanges.has(field) ? undefined : actual.getFieldRange(field),
  };
});
vi.mock("@/lib/nir-cost-estimation", async (original) => ({
  ...(await original<typeof import("@/lib/nir-cost-estimation")>()),
  resolveInspectionRates: inspectionRates,
}));

import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import {
  blockedParts,
  expectNoRangeFigure,
} from "@/lib/pricing/__tests__/no-range-figure";
import { POST } from "../route";

const RATE_FIELDS = [
  "masterQualifiedNormalHours",
  "qualifiedTechnicianNormalHours",
  "labourerNormalHours",
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "dehumidifierLGRDailyRate",
  "dehumidifierDesiccantDailyRate",
  "afdUnitLargeDailyRate",
  "extractionTruckMountedHourlyRate",
  "extractionElectricHourlyRate",
  "injectionDryingSystemDailyRate",
  "antimicrobialTreatmentRate",
  "mouldRemediationTreatmentRate",
  "biohazardTreatmentRate",
  "administrationFee",
  "callOutFee",
  "thermalCameraUseCostPerAssessment",
];
const priceList = (overrides: Record<string, number | null> = {}) => ({
  ...Object.fromEntries(RATE_FIELDS.map((f) => [f, 40])),
  ...overrides,
});

const SCOPE_ITEMS = [
  {
    id: "s1",
    itemType: "install_dehumidification",
    description: "LGR dehumidifiers",
    quantity: 3,
    unit: "day",
    specification: null,
    justification: null,
  },
  {
    id: "s2",
    itemType: "install_air_movers",
    description: "Air movers",
    quantity: 2,
    unit: "day",
    specification: null,
    justification: null,
  },
];

function post() {
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/cost-estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replace: true }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hiddenRanges.clear();
  session.mockResolvedValue({ user: { id: "u1" } });
  findFirst.mockResolvedValue({
    id: "i1",
    status: "SCOPED",
    propertyPostcode: "4000",
    createdAt: new Date("2026-10-10T00:00:00Z"),
    scopeItems: SCOPE_ITEMS,
  });
  transaction.mockResolvedValue([{ id: "ce1" }, { id: "ce2" }]);
});

describe("POST cost-estimates: a rate that is not set (RA-8281 B2)", () => {
  it("shows the blocked line with no national range, beside the priced line", async () => {
    inspectionRates.mockResolvedValue({
      ok: true,
      rates: priceList({ dehumidifierLGRDailyRate: null }),
    });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("RATE_NOT_SET");
    // RA-8281 step 1: no min or max of this field anywhere in the answer.
    expectNoRangeFigure(blockedParts(body), "dehumidifierLGRDailyRate");
    expect(body.blocked.lines).toEqual([
      {
        description: "LGR dehumidifiers",
        quantity: 3,
        unit: "day",
        rate: null,
        subtotal: null,
        pricingStatus: "rate_not_set",
        rateField: "dehumidifierLGRDailyRate",
        pricingNote: `Rate not set. Set dehumidifierLGRDailyRate in your price list.`,
      },
      {
        description: "Air movers",
        quantity: 2,
        unit: "day",
        rate: 40,
        subtotal: 80,
        pricingStatus: "priced",
      },
    ]);
  });

  it("blocks the total and saves nothing", async () => {
    inspectionRates.mockResolvedValue({
      ok: true,
      rates: priceList({ dehumidifierLGRDailyRate: null }),
    });

    const res = await post();
    const body = await res.json();

    expect(body.blocked.status).toBe("blocked");
    expect(body.blocked.total).toBeNull();
    expect(body.blocked.totalNote).toBe(
      "Total not available: rate not set",
    );
    expect(body.blocked.missing.map((m: { field: string }) => m.field)).toEqual(
      ["dehumidifierLGRDailyRate"],
    );
    // No partial sum of the priced line, and no summary of any kind.
    expect(body.summary).toBeUndefined();
    expect(body.costEstimates).toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("never prices the unset rate at $0, the midpoint or a figure from the range", async () => {
    inspectionRates.mockResolvedValue({
      ok: true,
      rates: priceList({ dehumidifierLGRDailyRate: null }),
    });

    const body = await (await post()).json();
    const blocked = body.blocked.lines[0];
    const range = NRPG_RATE_RANGES.dehumidifierLGRDailyRate;

    expect(blocked.rate).toBeNull();
    expect(blocked.subtotal).toBeNull();
    for (const stand of [0, range.min, range.max, (range.min + range.max) / 2]) {
      expect(blocked.rate).not.toBe(stand);
      expect(blocked.subtotal).not.toBe(3 * stand);
    }
  });

  it("answers the same whether or not the range table holds the field", async () => {
    hiddenRanges.add("dehumidifierLGRDailyRate");
    inspectionRates.mockResolvedValue({
      ok: true,
      rates: priceList({ dehumidifierLGRDailyRate: null }),
    });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.blocked.lines[0]).toMatchObject({
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      pricingNote:
        "Rate not set. Set dehumidifierLGRDailyRate in your price list.",
    });
    expect(JSON.stringify(body)).not.toContain("national range");
    expect(body.blocked.total).toBeNull();
  });

  it("control: with every rate set the estimate is priced and saved", async () => {
    inspectionRates.mockResolvedValue({ ok: true, rates: priceList() });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.blocked).toBeUndefined();
    // 3 days at $40 and 2 days at $40, plus the 10% contingency.
    expect(body.summary.subtotal).toBe(200);
    expect(body.summary.total).toBe(220);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
