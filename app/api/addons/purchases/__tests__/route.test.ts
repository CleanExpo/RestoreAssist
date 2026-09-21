/**
 * GET /api/addons/purchases — RA-7448: the table-absent fallback must be
 * distinguishable from a customer who genuinely bought nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const addonFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    addonPurchase: { findMany: (...a: unknown[]) => addonFindMany(...a) },
  },
}));

import { GET } from "../route";

const request = () => new NextRequest("http://localhost/api/addons/purchases");

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("GET /api/addons/purchases", () => {
  it("returns a real empty result with no table-absent marker", async () => {
    addonFindMany.mockResolvedValue([]);

    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, purchases: [] });
  });

  it("marks the fallback when the AddonPurchase table does not exist", async () => {
    addonFindMany.mockRejectedValue(
      new Error('The table "public.AddonPurchase" does not exist in the current database.'),
    );

    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      purchases: [],
      source: "table-absent",
    });
  });

  it("still surfaces any other database error as a failure", async () => {
    addonFindMany.mockRejectedValue(new Error("connection reset"));

    const res = await GET(request());

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
