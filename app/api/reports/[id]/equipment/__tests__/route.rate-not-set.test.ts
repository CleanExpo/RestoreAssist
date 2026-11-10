import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8281 B1 class fix: the WRITER of stored equipment. The server prices the
// selections from the report business's CURRENT price list. The client's
// cached rates and total are not trusted, an unset rate refuses the save, and
// nothing is ever stored as $0.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const resolveReportPricing = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/pricing/report-pricing", () => ({
  resolveReportPricing: (...args: unknown[]) => resolveReportPricing(...args),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { GET, POST } from "../route";

const DAYS = 4;

function save(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/reports/report-1/equipment", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "report-1" }) },
  );
}

function body(cachedRate: number | undefined, clientTotal: number) {
  return {
    equipmentSelection: [
      { groupId: "lgr-85", quantity: 1, dailyRate: cachedRate },
    ],
    equipmentCostTotal: clientTotal,
    estimatedDryingDuration: DAYS,
  };
}

function priceListNow(rate: number | null) {
  resolveReportPricing.mockResolvedValue({
    ok: true,
    pricingConfig: { dehumidifierLGRDailyRate: rate },
  });
}

beforeEach(() => {
  for (const m of [getServerSession, userFindUnique, reportFindUnique, reportUpdate, resolveReportPricing]) {
    m.mockReset();
  }
  getServerSession.mockResolvedValue({ user: { id: "owner-a" } });
  userFindUnique.mockResolvedValue({ id: "owner-a", pricingConfig: null });
  reportFindUnique.mockResolvedValue({
    id: "report-1",
    userId: "owner-a",
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });
  reportUpdate.mockResolvedValue({});
});

describe("POST /api/reports/[id]/equipment prices on the server", () => {
  it.each([
    { label: "cached 0, client total 0", cached: 0, total: 0 },
    { label: "stale cached 61, client total 244", cached: 61, total: 244 },
    { label: "no cached rate, client total 0", cached: undefined, total: 0 },
  ])(
    "$label with the current rate cleared: 422 naming the unset rate, nothing stored",
    async ({ cached, total }) => {
      priceListNow(null);
      const res = await save(body(cached, total));
      expect(res.status).toBe(422);
      expect(JSON.stringify(await res.json())).toMatch(/Rate not set/);
      expect(reportUpdate).not.toHaveBeenCalled();
    },
  );

  // RA-8281 B1 review round 10: a line that cannot be read is never dropped
  // and saved as an empty list with a $0 total.
  it.each([
    { label: "no equipment type", sel: { quantity: 1, dailyRate: 61 } },
    { label: "empty equipment type", sel: { groupId: "", quantity: 1 } },
    { label: "non-numeric quantity", sel: { groupId: "lgr-85", quantity: "abc" } },
    { label: "negative quantity", sel: { groupId: "lgr-85", quantity: -1 } },
    { label: "not an object", sel: "lgr-85" },
  ])("a malformed line ($label) refuses the save with 422, nothing stored", async ({ sel }) => {
    priceListNow(70);
    const res = await save({ equipmentSelection: [sel], equipmentCostTotal: 0, estimatedDryingDuration: DAYS });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toMatch(/cannot be priced/);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  // RA-8281 B1 review round 11: a posted value that is not a list is read as
  // one line and priced (or refused), never treated as "no equipment".
  it("a single posted object with the current rate cleared is refused (422), nothing stored", async () => {
    priceListNow(null);
    const res = await save({
      equipmentSelection: { groupId: "lgr-85", quantity: 1, dailyRate: 61 },
      estimatedDryingDuration: DAYS,
    });
    expect(res.status).toBe(422);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("a posted bare string is a malformed line: 422, nothing stored", async () => {
    priceListNow(70);
    const res = await save({ equipmentSelection: "lgr-85", estimatedDryingDuration: DAYS });
    expect(res.status).toBe(422);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("control: a single posted object with a set rate is stored as one priced line", async () => {
    priceListNow(70);
    const res = await save({
      equipmentSelection: { groupId: "lgr-85", quantity: 1, dailyRate: 61 },
      estimatedDryingDuration: DAYS,
    });
    expect(res.status).toBe(200);
    const data = reportUpdate.mock.calls[0][0].data;
    expect(JSON.parse(data.equipmentSelection)).toEqual([
      { groupId: "lgr-85", quantity: 1, dailyRate: 70 },
    ]);
    expect(data.equipmentCostTotal).toBe(70 * DAYS);
  });

  it("control: stores the server's own rate and total, not the client's cached 61 / 244", async () => {
    priceListNow(70);
    const res = await save(body(61, 244));
    expect(res.status).toBe(200);
    const data = reportUpdate.mock.calls[0][0].data;
    expect(data.equipmentCostTotal).toBe(70 * DAYS);
    expect(JSON.parse(data.equipmentSelection)).toEqual([
      { groupId: "lgr-85", quantity: 1, dailyRate: 70 },
    ]);
  });

  it("an unconfirmed business stores nothing (403)", async () => {
    resolveReportPricing.mockResolvedValue({ ok: false });
    const res = await save(body(61, 244));
    expect(res.status).toBe(403);
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("control: an empty selection list still saves, with no total", async () => {
    const res = await save({ equipmentSelection: [], estimatedDryingDuration: DAYS });
    expect(res.status).toBe(200);
    const data = reportUpdate.mock.calls[0][0].data;
    expect(data.equipmentSelection).toBe("[]");
    expect(data.equipmentCostTotal).toBeNull();
    expect(resolveReportPricing).not.toHaveBeenCalled();
  });
});

// RA-8281 B1 round 13 (review round 12, P1 2): the screen reloads from GET.
// It answers with the stored lines priced NOW; the rate cached on the stored
// line and the cached report.equipmentCostTotal are never returned.
describe("GET /api/reports/[id]/equipment prices the stored lines now", () => {
  function load() {
    return GET(
      new NextRequest("http://localhost/api/reports/report-1/equipment"),
      { params: Promise.resolve({ id: "report-1" }) },
    );
  }
  function stored(equipmentSelection: string | null, equipmentCostTotal: number | null) {
    reportFindUnique.mockResolvedValue({
      id: "report-1",
      userId: "owner-a",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      psychrometricAssessment: null,
      scopeAreas: null,
      equipmentSelection,
      equipmentCostTotal,
      estimatedDryingDuration: DAYS,
    });
  }
  const STALE = JSON.stringify([{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }]);

  it("stale stored 61 / 244 with the price-list rate cleared: rate not set, no 61, no 244", async () => {
    stored(STALE, 244);
    priceListNow(null);
    const res = await load();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.equipmentSelection).toHaveLength(1);
    expect(data.equipmentSelection[0].dailyRate).toBeNull();
    expect(data.equipmentSelection[0].note).toMatch(/Rate not set/);
    expect(data.equipmentCostTotal).toBeNull();
    expect(data.equipmentProblems.join(" ")).toMatch(/Rate not set/);
    const text = JSON.stringify(data);
    expect(text).not.toContain("244");
    expect(text).not.toContain("61");
  });

  it("control: a set rate returns the current price (70), not the cached 61 / 244", async () => {
    stored(STALE, 244);
    priceListNow(70);
    const data = await (await load()).json();
    expect(data.equipmentSelection[0]).toMatchObject({
      groupId: "lgr-85",
      quantity: 1,
      usable: true,
      dailyRate: 70,
      note: null,
    });
    expect(data.equipmentCostTotal).toBe(70 * DAYS);
    expect(data.equipmentProblems).toEqual([]);
    const [creatorId, , createdAt] = resolveReportPricing.mock.calls[0];
    expect(creatorId).toBe("owner-a");
    expect(createdAt).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("an unconfirmed business gets no price list: every rate reads not set, never the cached figure", async () => {
    stored(STALE, 244);
    resolveReportPricing.mockResolvedValue({ ok: false });
    const data = await (await load()).json();
    expect(data.equipmentSelection[0].dailyRate).toBeNull();
    expect(data.equipmentCostTotal).toBeNull();
  });

  it.each([
    { label: "a null entry", column: "[null]" },
    { label: "a line with no equipment type", column: JSON.stringify([{ quantity: 2, dailyRate: 61 }]) },
    { label: "text that is not JSON", column: "{not json" },
  ])("$label is returned as one line that is not usable, with a blocked total (no 500)", async ({ column }) => {
    stored(column, 244);
    priceListNow(70);
    const res = await load();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.equipmentSelection).toHaveLength(1);
    expect(data.equipmentSelection[0]).toMatchObject({ usable: false, dailyRate: null });
    expect(data.equipmentSelection[0].note).toMatch(/cannot be priced/);
    expect(data.equipmentCostTotal).toBeNull();
    expect(JSON.stringify(data)).not.toContain("244");
  });

  it("a usable line beside an unusable one: the usable line is priced, the total stays blocked", async () => {
    stored(JSON.stringify([null, { groupId: "lgr-85", quantity: 2, dailyRate: 61 }]), 244);
    priceListNow(70);
    const data = await (await load()).json();
    expect(data.equipmentSelection.map((l: { usable: boolean }) => l.usable)).toEqual([false, true]);
    expect(data.equipmentSelection[1].dailyRate).toBe(70);
    expect(data.equipmentCostTotal).toBeNull();
  });

  it("control: nothing stored answers null and reads no price list; a stale cached total is not returned", async () => {
    stored(null, 244);
    const data = await (await load()).json();
    expect(data.equipmentSelection).toBeNull();
    expect(data.equipmentCostTotal).toBeNull();
    expect(resolveReportPricing).not.toHaveBeenCalled();
  });

  it("control: a stored empty list answers [] with no total", async () => {
    stored("[]", null);
    const data = await (await load()).json();
    expect(data.equipmentSelection).toEqual([]);
    expect(data.equipmentCostTotal).toBeNull();
  });
});
