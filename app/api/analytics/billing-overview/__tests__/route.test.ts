import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const verifyPlatformSupportOperator = vi.hoisted(() => vi.fn());
const userGroupBy = vi.hoisted(() => vi.fn());
const userCount = vi.hoisted(() => vi.fn());
const userAggregate = vi.hoisted(() => vi.fn());
const addonPurchaseAggregate = vi.hoisted(() => vi.fn());
const addonPurchaseFindMany = vi.hoisted(() => vi.fn());
const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { groupBy: userGroupBy, count: userCount, aggregate: userAggregate },
    addonPurchase: {
      aggregate: addonPurchaseAggregate,
      findMany: addonPurchaseFindMany,
    },
    $queryRaw: queryRaw,
  },
}));

// lib/ios-billing-guard is deliberately NOT mocked. The iOS control below is
// only worth having if it exercises the real header check.
import { GET } from "../route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/analytics/billing-overview", {
    method: "GET",
    headers,
  });
}

function expectNoBillingDataRead() {
  expect(userGroupBy).not.toHaveBeenCalled();
  expect(userCount).not.toHaveBeenCalled();
  expect(userAggregate).not.toHaveBeenCalled();
  expect(addonPurchaseAggregate).not.toHaveBeenCalled();
  expect(addonPurchaseFindMany).not.toHaveBeenCalled();
  expect(queryRaw).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin-A" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin-A", role: "ADMIN", organizationId: "org-A" },
  });
  verifyPlatformSupportOperator.mockReturnValue({ response: null });
});

describe("GET /api/analytics/billing-overview", () => {
  it("refuses a tenant admin who is not platform-support staff", async () => {
    // Every self-serve signup is the ADMIN of its own organisation (RA-7592),
    // so the admin gate alone exposes platform MRR, churn, credit balances and
    // other tenants' purchaser names and emails.
    verifyPlatformSupportOperator.mockReturnValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expectNoBillingDataRead();
  });

  it("refuses the iOS Capacitor shell before it authenticates anyone", async () => {
    // RA-1842 Path B — Apple guideline 3.1.1 rejected build 1.0(3) over paid
    // content in the shell. The header is injected only by CapacitorFetchInit,
    // so a browser on the same device is unaffected.
    const response = await GET(request({ "x-capacitor-platform": "ios" }));

    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expectNoBillingDataRead();
  });

  it("lets a browser on the same device through the iOS guard", async () => {
    // The paired half of the control above: without the Capacitor header the
    // guard must not fire, or the 403 proves nothing about the header check.
    verifyPlatformSupportOperator.mockReturnValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const response = await GET(request({ "user-agent": "Safari/iPad" }));

    expect(response.status).toBe(403);
    // Reached the auth layer rather than being stopped at the shell guard.
    expect(getServerSession).toHaveBeenCalled();
    expect(verifyPlatformSupportOperator).toHaveBeenCalled();
  });
});
