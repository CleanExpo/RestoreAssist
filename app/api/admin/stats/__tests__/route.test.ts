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
  queryRaw.mockResolvedValue([{ health: 1 }]);
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userCount.mockReset();
  organizationCount.mockReset();
  reportCount.mockReset();
  integrationCount.mockReset();
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
});
