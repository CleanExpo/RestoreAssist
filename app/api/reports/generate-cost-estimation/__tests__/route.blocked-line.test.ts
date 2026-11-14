import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-8281 (B2): the cost estimation document shows a blocked line for a
 * price-list rate that is not set, instead of refusing with a bare error. A
 * blocked document is never written to the report.
 */

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "owner_a" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    req: NextRequest,
    _key: string,
    fn: (raw: string) => Promise<Response>,
  ) => req.text().then(fn),
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  hasActiveSubscription: vi.fn().mockResolvedValue(true),
}));

const { tenant, userFind, reportFind, reportUpdate, hiddenRanges } = vi.hoisted(
  () => ({
    tenant: vi.fn(),
    userFind: vi.fn(),
    reportFind: vi.fn(),
    reportUpdate: vi.fn(),
    hiddenRanges: new Set<string>(),
  }),
);
vi.mock("@/lib/organization-credits", () => ({ getResourceTenant: tenant }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFind },
    report: { findUnique: reportFind, update: reportUpdate },
    organizationPricingConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    companyPricingConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  },
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

import {
  blockedParts,
  expectNoRangeFigure,
} from "@/lib/pricing/__tests__/no-range-figure";
import { BASE_RATE_FIELDS } from "@/lib/pricing/rate-not-set";
import { POST } from "../route";

const priceList = (overrides: Record<string, number | null> = {}) => ({
  ...Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 50])),
  ...overrides,
});

const REPORT = {
  id: "rep_a",
  userId: "owner_a",
  createdAt: new Date("2026-10-10T00:00:00Z"),
  reportNumber: "RA-1",
  waterCategory: "2",
  estimatedDryingDuration: 4,
  equipmentSelection: JSON.stringify([{ groupId: "lgr-85", quantity: 2 }]),
  inspection: null,
};

function post() {
  return POST(
    new NextRequest("http://localhost/api/reports/generate-cost-estimation", {
      method: "POST",
      body: JSON.stringify({ reportId: "rep_a" }),
      headers: { "content-type": "application/json" },
    }),
  );
}

function withPriceList(pricingConfig: unknown) {
  userFind.mockResolvedValue({
    id: "owner_a",
    organization: { country: "AU" },
    pricingConfig,
  });
}

type Line = {
  description: string;
  rate: number | null;
  subtotal: number | null;
  pricingStatus: string;
  rateField?: string;
  pricingNote?: string;
};
const lineFor = (lines: Line[], text: string) =>
  lines.find((l) => l.description.includes(text)) as Line;

beforeEach(() => {
  vi.clearAllMocks();
  hiddenRanges.clear();
  tenant.mockResolvedValue({ ownerId: "owner_a", organizationId: null });
  reportFind.mockResolvedValue(REPORT);
  reportUpdate.mockResolvedValue(REPORT);
});

describe("POST generate-cost-estimation: a rate that is not set (RA-8281 B2)", () => {
  it("shows the blocked line with no national range, beside the priced lines", async () => {
    withPriceList(priceList({ callOutFee: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("RATE_NOT_SET");
    // RA-8281 step 1: no min or max of this field anywhere in the answer.
    expectNoRangeFigure(blockedParts(body), "callOutFee");
    expect(lineFor(body.blocked.lines, "Minimal Call-Out Fee")).toEqual({
      description: "Call-Out Fees: Minimal Call-Out Fee",
      quantity: 1,
      unit: null,
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "callOutFee",
      pricingNote: `Rate not set. Set callOutFee in your price list.`,
    });
    expect(lineFor(body.blocked.lines, "Truck-Mounted")).toMatchObject({
      rate: 50,
      subtotal: 200,
      pricingStatus: "priced",
    });
    // Every other line of the document is still listed.
    expect(body.blocked.lines.length).toBeGreaterThan(8);
  });

  it("blocks the total and writes nothing to the report", async () => {
    withPriceList(priceList({ callOutFee: null }));

    const body = await (await post()).json();

    expect(body.blocked.status).toBe("blocked");
    expect(body.blocked.total).toBeNull();
    expect(body.blocked.totalNote).toBe("Total not available: rate not set");
    expect(body.blocked.missing.map((m: { field: string }) => m.field)).toEqual(
      ["callOutFee"],
    );
    expect(body.costEstimation).toBeUndefined();
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("an equipment rate that is not set is a blocked equipment line with no range", async () => {
    withPriceList(priceList({ dehumidifierLGRDailyRate: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    // RA-8281 step 1: no min or max of this field anywhere in the answer.
    expectNoRangeFigure(blockedParts(body), "dehumidifierLGRDailyRate");
    const line = body.blocked.lines.find((l: Line) =>
      l.description.startsWith("Equipment Rental:"),
    );
    expect(line).toMatchObject({
      quantity: 2,
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "dehumidifierLGRDailyRate",
    });
    expect(body.blocked.missing).toEqual([
      expect.objectContaining({
        field: "dehumidifierLGRDailyRate",
      }),
    ]);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("answers the same whether or not the range table holds the field", async () => {
    hiddenRanges.add("callOutFee");
    withPriceList(priceList({ callOutFee: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(lineFor(body.blocked.lines, "Minimal Call-Out Fee")).toMatchObject({
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      pricingNote: "Rate not set. Set callOutFee in your price list.",
    });
    expect(JSON.stringify(body)).not.toContain("national range");
    expect(body.blocked.total).toBeNull();
  });

  it("control: with every rate set the document is priced and saved", async () => {
    withPriceList(priceList());

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.blocked).toBeUndefined();
    const { totals, categories } = body.costEstimation.data;
    expect(categories.callOut.total).toBe(50);
    expect(totals.subtotal).toBeGreaterThan(0);
    expect(totals.totalIncGST).toBeCloseTo(totals.subtotal * 1.1, 6);
    expect(body.costEstimation.data.blockedPricing).toBeUndefined();
    expect(reportUpdate).toHaveBeenCalledTimes(1);
    expect(reportUpdate.mock.calls[0][0].data.totalCost).toBe(
      totals.totalIncGST,
    );
  });
});
