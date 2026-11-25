/**
 * RA-7592 — GET /api/admin/stats is RestoreAssist's own platform totals.
 *
 * `verifyAdminFromDb` only re-checks that the caller is still ADMIN in the
 * database. Registration makes every business owner ADMIN of their own
 * organisation, so that gate admits every customer. These pins require the
 * PLATFORM_SUPPORT_USER_IDS allowlist before any count query runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userCount = vi.fn();
const organizationCount = vi.fn();
const reportCount = vi.fn();
const integrationCount = vi.fn();
const integrationFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      count: (...args: unknown[]) => userCount(...args),
    },
    organization: {
      count: (...args: unknown[]) => organizationCount(...args),
    },
    report: {
      count: (...args: unknown[]) => reportCount(...args),
    },
    integration: {
      count: (...args: unknown[]) => integrationCount(...args),
      findMany: (...args: unknown[]) => integrationFindMany(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { GET } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/stats");
}

function signInTenantAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    organizationId: "org-tenant",
  });
}

function mockStatsQueries() {
  userCount.mockResolvedValue(12);
  organizationCount.mockResolvedValue(4);
  reportCount.mockResolvedValue(30);
  integrationCount.mockResolvedValue(0);
  integrationFindMany.mockResolvedValue([]);
  queryRaw.mockResolvedValue([{ health: 1 }]);
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userCount.mockReset();
  organizationCount.mockReset();
  reportCount.mockReset();
  integrationCount.mockReset();
  integrationFindMany.mockReset();
  queryRaw.mockReset();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/stats (RA-7592)", () => {
  it("rejects stale ADMIN JWTs when the database role has been demoted", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "USER",
      organizationId: "org-tenant",
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userCount).not.toHaveBeenCalled();
  });

  it("refuses a tenant ADMIN — platform totals are not a tenant privilege", async () => {
    signInTenantAdmin();
    mockStatsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userCount).not.toHaveBeenCalled();
    expect(reportCount).not.toHaveBeenCalled();
  });

  it("returns totals only for an allowlisted platform-support operator", async () => {
    signInTenantAdmin();
    mockStatsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalUsers).toBe(12);
    expect(body.totalReports).toBe(30);
    expect(userCount).toHaveBeenCalled();
  });

  // RA-8446: "connected" is the readiness owner's answer, not status === CONNECTED.
  it("counts only connections the readiness owner calls ready", async () => {
    signInTenantAdmin();
    mockStatsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");
    integrationFindMany.mockResolvedValue([
      { id: "a", provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: "org" },
      { id: "b", provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: null },
      { id: "c", provider: "QUICKBOOKS", name: "QuickBooks", status: "SYNCING", realmId: "realm" },
      { id: "d", provider: "QUICKBOOKS", name: "QuickBooks", status: "CONNECTED", realmId: null },
    ]);

    const body = await (await GET(makeRequest())).json();

    expect(body.integrationCounts.connected).toBe(2);
    expect(integrationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["CONNECTED", "SYNCING", "ERROR"] },
        accessToken: { not: null, notIn: [""] },
      }),
    }));
  });

  it("pages through every candidate row so the count is exact", async () => {
    signInTenantAdmin();
    mockStatsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => (
      { id: `x${String(from + i).padStart(4, "0")}`, provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: "org" }
    ));
    integrationFindMany.mockResolvedValueOnce(page(0, 500)).mockResolvedValueOnce(page(500, 3));

    const body = await (await GET(makeRequest())).json();

    expect(body.integrationCounts.connected).toBe(503);
    expect(integrationFindMany).toHaveBeenCalledTimes(2);
    expect(integrationFindMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "x0499" }, skip: 1 });
  });
});
