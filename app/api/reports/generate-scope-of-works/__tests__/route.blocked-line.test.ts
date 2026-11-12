import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-8281 (B2): the scope of works document shows a blocked line for a
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
    new NextRequest("http://localhost/api/reports/generate-scope-of-works", {
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
const lineFor = (lines: Line[], id: string) =>
  lines.find((l) => l.description.startsWith(`${id}:`)) as Line;

beforeEach(() => {
  vi.clearAllMocks();
  hiddenRanges.clear();
  tenant.mockResolvedValue({ ownerId: "owner_a", organizationId: null });
  reportFind.mockResolvedValue(REPORT);
  reportUpdate.mockResolvedValue(REPORT);
});

describe("POST generate-scope-of-works: a rate that is not set (RA-8281 B2)", () => {
  it("shows the blocked line with no national range, beside the priced lines", async () => {
    withPriceList(priceList({ administrationFee: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("RATE_NOT_SET");
    // RA-8281 step 1: no min or max of this field anywhere in the answer.
    expectNoRangeFigure(blockedParts(body), "administrationFee");
    expect(lineFor(body.blocked.lines, "RW_10")).toEqual({
      description: "RW_10: Administration & Documentation Fee",
      quantity: 1,
      unit: "Claim",
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "administrationFee",
      pricingNote: `Rate not set. Set administrationFee in your price list.`,
    });
    expect(lineFor(body.blocked.lines, "RW_1")).toMatchObject({
      rate: 50,
      subtotal: 50,
      pricingStatus: "priced",
    });
    // Every line of the document is still listed (RW_6 needs Class 4 drying):
    // nine lines, and each equipment line under RW_3 with its own amount.
    const equipmentRows = body.blocked.lines.filter((l: { description: string }) =>
      l.description.startsWith("RW_3 equipment: "),
    );
    expect(equipmentRows.length).toBeGreaterThan(0);
    for (const row of equipmentRows) {
      expect(row.pricingStatus).toBe("priced");
      expect(typeof row.subtotal).toBe("number");
    }
    expect(body.blocked.lines).toHaveLength(9 + equipmentRows.length);
  });

  it("blocks the document and writes nothing to the report", async () => {
    withPriceList(priceList({ administrationFee: null }));

    const body = await (await post()).json();

    expect(body.blocked.status).toBe("blocked");
    expect(body.blocked.total).toBeNull();
    expect(body.blocked.totalNote).toBe("Total not available: rate not set");
    expect(body.blocked.missing.map((m: { field: string }) => m.field)).toEqual(
      ["administrationFee"],
    );
    expect(body.scopeOfWorks).toBeUndefined();
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("a labour rate shared by several lines blocks each of them, never $0", async () => {
    withPriceList(priceList({ masterQualifiedNormalHours: null }));

    const body = await (await post()).json();

    for (const id of ["RW_3", "RW_4", "RW_9"]) {
      expect(lineFor(body.blocked.lines, id)).toMatchObject({
        subtotal: null,
        pricingStatus: "rate_not_set",
        rateField: "masterQualifiedNormalHours",
      });
    }
    // Lines that do not use the master rate keep their amounts.
    expect(lineFor(body.blocked.lines, "RW_5")).toMatchObject({
      subtotal: 200,
      pricingStatus: "priced",
    });
  });

  it("an equipment rate that is not set blocks the equipment line with no range", async () => {
    withPriceList(priceList({ dehumidifierLGRDailyRate: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    // RA-8281 step 1: no min or max of this field anywhere in the answer.
    expectNoRangeFigure(blockedParts(body), "dehumidifierLGRDailyRate");
    expect(lineFor(body.blocked.lines, "RW_3")).toMatchObject({
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "dehumidifierLGRDailyRate",
    });
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("answers the same whether or not the range table holds the field", async () => {
    hiddenRanges.add("administrationFee");
    withPriceList(priceList({ administrationFee: null }));

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(lineFor(body.blocked.lines, "RW_10")).toMatchObject({
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      pricingNote: "Rate not set. Set administrationFee in your price list.",
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
    const items = body.scopeOfWorks.data.lineItems;
    expect(items.find((i: { id: string }) => i.id === "RW_10").subtotal).toBe(
      50,
    );
    expect(
      items.every((i: { subtotal: unknown }) => typeof i.subtotal === "number"),
    ).toBe(true);
    expect(body.scopeOfWorks.data.blockedPricing).toBeUndefined();
    expect(reportUpdate).toHaveBeenCalledTimes(1);
  });
});
