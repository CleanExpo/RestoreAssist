import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-7893 — an invited member generating a cost estimation on the owner's
 * plan is priced at the pricing of the organisation the report belongs to,
 * not refused for having no pricing row of their own (Codex round 17
 * P1-OWNER-PLAN-COST-ESTIMATION-USES-MEMBER-PRICING), and never at another
 * organisation the same owner owns (round 18 P1-MULTI-ORG-OWNER-REPORT-PRICING).
 */

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "member_a" } }),
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

const { tenant, orgPricingFind, legacyPricingFind, userFind, reportFind, reportUpdate } =
  vi.hoisted(() => ({
    tenant: vi.fn(),
    orgPricingFind: vi.fn(),
    legacyPricingFind: vi.fn(),
    userFind: vi.fn(),
    reportFind: vi.fn(),
    reportUpdate: vi.fn(),
  }));
vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: tenant,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFind },
    report: { findUnique: reportFind, update: reportUpdate },
    organizationPricingConfig: { findUnique: orgPricingFind },
    companyPricingConfig: { findUnique: legacyPricingFind },
  },
}));

import { POST } from "../route";

const rates = (n: number) => new Proxy({}, { get: () => n });
const REPORT = {
  id: "rep_a",
  userId: "member_a",
  createdAt: new Date("2026-10-10T00:00:00Z"),
  reportNumber: "RA-1",
  waterCategory: "2",
  inspection: null,
};

function req() {
  return new NextRequest("http://localhost/api/reports/generate-cost-estimation", {
    method: "POST",
    body: JSON.stringify({ reportId: "rep_a" }),
    headers: { "content-type": "application/json" },
  });
}

const data = async (res: Response) =>
  JSON.stringify((await res.json()).costEstimation.data);

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockResolvedValue({
    id: "member_a",
    organization: { country: "AU" },
    pricingConfig: null,
  });
  reportFind.mockResolvedValue(REPORT);
  reportUpdate.mockResolvedValue(REPORT);
  orgPricingFind.mockResolvedValue(null);
  legacyPricingFind.mockResolvedValue(null);
});

describe("POST /api/reports/generate-cost-estimation — invited member (RA-7893)", () => {
  it("prices the report at its organisation's pricing", async () => {
    tenant.mockResolvedValue({ ownerId: "owner_a", organizationId: "org_a" });
    orgPricingFind.mockResolvedValue(rates(77));

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(tenant).toHaveBeenCalledWith("member_a", REPORT.createdAt);
    expect(orgPricingFind).toHaveBeenCalledWith({ where: { organizationId: "org_a" } });
    expect(await data(res)).toContain("77");
  });

  it("uses the report's organisation when the owner owns two", async () => {
    tenant.mockResolvedValue({ ownerId: "owner_both", organizationId: "org_b" });
    orgPricingFind.mockImplementation(async ({ where }: { where: { organizationId: string } }) =>
      where.organizationId === "org_b" ? rates(88) : rates(11),
    );

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(orgPricingFind).not.toHaveBeenCalledWith({ where: { organizationId: "org_a" } });
    expect(await data(res)).toContain("88");
  });

  it("falls back to the organisation owner's legacy row", async () => {
    tenant.mockResolvedValue({ ownerId: "owner_a", organizationId: "org_a" });
    legacyPricingFind.mockResolvedValue(rates(66));

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(legacyPricingFind).toHaveBeenCalledWith({ where: { userId: "owner_a" } });
    expect(await data(res)).toContain("66");
  });

  it("keeps the owner's own pricing row for an owner's report", async () => {
    tenant.mockResolvedValue({ ownerId: "member_a", organizationId: null });
    userFind.mockResolvedValue({
      id: "member_a",
      organization: { country: "AU" },
      pricingConfig: rates(55),
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(orgPricingFind).not.toHaveBeenCalled();
    expect(await data(res)).toContain("55");
  });

  it("refuses when the report's business cannot be proven", async () => {
    tenant.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect(orgPricingFind).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });
});
