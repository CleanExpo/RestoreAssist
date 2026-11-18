/**
 * RA-8281 B1 round 13: the account data export answers with whole Report
 * rows. It cannot reprice up to 1,000 rows, so it returns each stored
 * equipment line without its cached rate and leaves the cached
 * equipmentCostTotal out. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const reportFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ id: "user-1", name: "Synthetic User" }) },
    report: { findMany: (...a: unknown[]) => reportFindMany(...a) },
    client: { findMany: async () => [] },
    inspection: { findMany: async () => [] },
    estimate: { findMany: async () => [] },
  },
}));

import { GET } from "../route";

async function exported() {
  const res = await GET(new NextRequest("http://localhost/api/user/export"));
  expect(res.status).toBe(200);
  return JSON.parse(await res.text());
}

beforeEach(() => reportFindMany.mockReset());

describe("GET /api/user/export never returns cached equipment money", () => {
  it("stored 61 / 244: the line is exported without its rate and the cached total is left out", async () => {
    reportFindMany.mockResolvedValue([
      {
        id: "r1",
        title: "Synthetic report",
        equipmentSelection: JSON.stringify([
          null,
          { groupId: "lgr-85", quantity: 4, dailyRate: 61 },
        ]),
        equipmentCostTotal: 244,
        estimatedDryingDuration: 1,
      },
    ]);
    const body = await exported();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].title).toBe("Synthetic report");
    expect(body.reports[0].equipmentSelection).toEqual([{ groupId: "lgr-85", quantity: 4 }]);
    expect("equipmentCostTotal" in body.reports[0]).toBe(false);
    const text = JSON.stringify(body.reports);
    expect(text).not.toContain("244");
    expect(text).not.toContain("61");
  });

  it("control: a report with nothing stored exports null lines and keeps its other fields", async () => {
    reportFindMany.mockResolvedValue([
      { id: "r2", title: "No equipment", equipmentSelection: null, equipmentCostTotal: null },
    ]);
    const body = await exported();
    expect(body.reports[0]).toMatchObject({ id: "r2", title: "No equipment", equipmentSelection: null });
  });
});
