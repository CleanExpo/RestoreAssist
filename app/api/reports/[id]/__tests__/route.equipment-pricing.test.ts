/**
 * RA-8281 B1 round 13: GET /api/reports/[id] serialises the whole Report row,
 * so without care it would echo the rate cached on each stored equipment line
 * and the cached equipmentCostTotal. It answers with the stored lines priced
 * NOW from the report business's price list instead. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const reportFindFirst = vi.fn();
const reportUpdate = vi.fn();
const userFindUnique = vi.fn();
const resolveReportPricing = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportFinancialReach: async () => ({
    ok: true,
    data: { AND: [{ OR: [{ userId: "reach-user" }] }] },
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...a: unknown[]) => reportFindFirst(...a),
      update: (...a: unknown[]) => reportUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock("@/lib/pricing/report-pricing", () => ({
  resolveReportPricing: (...a: unknown[]) => resolveReportPricing(...a),
}));

import { GET, PUT } from "../route";

const DAYS = 4;
const CREATED = new Date("2026-10-01T00:00:00Z");
const CREATOR_PRICING = { id: "creator-own-pricing" };

function stored(equipmentSelection: string | null, equipmentCostTotal: number | null) {
  reportFindFirst.mockResolvedValue({
    id: "r1",
    userId: "creator-1",
    createdAt: CREATED,
    propertyAddress: null,
    propertyPostcode: null,
    equipmentSelection,
    equipmentCostTotal,
    estimatedDryingDuration: DAYS,
    user: { name: "Synthetic Tech", email: "tech@example.test", organization: { country: "AU" } },
    client: null,
    inspection: null,
  });
}

async function get() {
  const res = await GET(new NextRequest("http://localhost/api/reports/r1"), {
    params: Promise.resolve({ id: "r1" }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

const STALE = JSON.stringify([{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }]);

beforeEach(() => {
  for (const m of [getServerSession, reportFindFirst, reportUpdate, userFindUnique, resolveReportPricing]) {
    m.mockReset();
  }
  getServerSession.mockResolvedValue({ user: { id: "viewer-1" } });
  userFindUnique.mockResolvedValue({ pricingConfig: CREATOR_PRICING });
});

describe("GET /api/reports/[id] prices stored equipment now", () => {
  it("stale stored 61 / 244 with the price-list rate cleared: rate not set, no 61, no 244", async () => {
    stored(STALE, 244);
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: null },
    });
    const body = await get();
    expect(body.equipmentSelection).toHaveLength(1);
    expect(body.equipmentSelection[0].dailyRate).toBeNull();
    expect(body.equipmentSelection[0].note).toMatch(/Rate not set/);
    expect(body.equipmentCostTotal).toBeNull();
    const text = JSON.stringify(body);
    expect(text).not.toContain("244");
    expect(text).not.toContain('"dailyRate":61');
  });

  it("control: a set rate returns the current price, resolved for the report's creator", async () => {
    stored(STALE, 244);
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: 70 },
    });
    const body = await get();
    expect(body.equipmentSelection[0]).toMatchObject({ groupId: "lgr-85", dailyRate: 70 });
    expect(body.equipmentCostTotal).toBe(70 * DAYS);
    // The price list is the report business's, keyed by the creator, not the viewer.
    expect(userFindUnique.mock.calls[0][0].where).toEqual({ id: "creator-1" });
    expect(resolveReportPricing).toHaveBeenCalledWith("creator-1", CREATOR_PRICING, CREATED);
  });

  it("an unconfirmed business gets no price list: rate not set, never the cached figure", async () => {
    stored(STALE, 244);
    resolveReportPricing.mockResolvedValue({ ok: false });
    const body = await get();
    expect(body.equipmentSelection[0].dailyRate).toBeNull();
    expect(body.equipmentCostTotal).toBeNull();
  });

  it.each(["[null]", "{not json"])(
    "stored %s is one line that is not usable with a blocked total (no 500)",
    async (column) => {
      stored(column, 244);
      resolveReportPricing.mockResolvedValue({
        ok: true,
        pricingConfig: { dehumidifierLGRDailyRate: 70 },
      });
      const body = await get();
      expect(body.equipmentSelection).toHaveLength(1);
      expect(body.equipmentSelection[0]).toMatchObject({ usable: false, dailyRate: null });
      expect(body.equipmentCostTotal).toBeNull();
    },
  );

  it("control: nothing stored answers null, drops a stale cached total, and reads no price list", async () => {
    stored(null, 244);
    const body = await get();
    expect(body.equipmentSelection).toBeNull();
    expect(body.equipmentCostTotal).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(resolveReportPricing).not.toHaveBeenCalled();
  });
});

// Review round 13 finding: PUT answered with the whole saved row, so it echoed
// the stored column text (cached rate 61) and the cached total 244 that GET no
// longer returns. A saved report answers with the same repriced equipment.
describe("PUT /api/reports/[id] answers with stored equipment priced now", () => {
  function saved(equipmentSelection: string | null, equipmentCostTotal: number | null) {
    reportFindFirst.mockResolvedValue({ id: "r1", userId: "viewer-1" });
    reportUpdate.mockResolvedValue({
      id: "r1",
      userId: "viewer-1",
      createdAt: CREATED,
      title: "Synthetic report",
      equipmentSelection,
      equipmentCostTotal,
      estimatedDryingDuration: DAYS,
      client: null,
    });
  }

  async function put() {
    const res = await PUT(
      new NextRequest("http://localhost/api/reports/r1", {
        method: "PUT",
        body: JSON.stringify({ title: "Synthetic report" }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(res.status).toBe(200);
    return res.json();
  }

  it("stale stored 61 / 244 with the price-list rate cleared: rate not set, no 61, no 244", async () => {
    saved(STALE, 244);
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: null },
    });
    const body = await put();
    expect(body.title).toBe("Synthetic report");
    expect(body.equipmentSelection).toHaveLength(1);
    expect(body.equipmentSelection[0].dailyRate).toBeNull();
    expect(body.equipmentSelection[0].note).toMatch(/Rate not set/);
    expect(body.equipmentCostTotal).toBeNull();
    const text = JSON.stringify(body);
    expect(text).not.toContain("244");
    expect(text).not.toContain("61");
  });

  it("control: a set rate answers with the current price, never the cached one", async () => {
    saved(STALE, 244);
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: 70 },
    });
    const body = await put();
    expect(body.equipmentSelection[0]).toMatchObject({ groupId: "lgr-85", dailyRate: 70 });
    expect(body.equipmentCostTotal).toBe(70 * DAYS);
  });

  it.each(["[null]", "{not json"])("stored %s: one line that is not usable, blocked total, no 500", async (column) => {
    saved(column, 244);
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: 70 },
    });
    const body = await put();
    expect(body.equipmentSelection[0]).toMatchObject({ usable: false, dailyRate: null });
    expect(body.equipmentCostTotal).toBeNull();
  });

  it("control: nothing stored answers null and drops a stale cached total", async () => {
    saved(null, 244);
    const body = await put();
    expect(body.equipmentSelection).toBeNull();
    expect(body.equipmentCostTotal).toBeNull();
    expect(resolveReportPricing).not.toHaveBeenCalled();
  });
});
