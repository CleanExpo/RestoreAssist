import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-7893 — an invited member generating a cost estimation on the owner's
 * plan is priced at the pricing of the business the report belongs to, not
 * refused for having no pricing row of their own (Codex round 17
 * P1-OWNER-PLAN-COST-ESTIMATION-USES-MEMBER-PRICING).
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

const { tenantOwner, effectivePricing, userFind, reportFind, reportUpdate } =
  vi.hoisted(() => ({
    tenantOwner: vi.fn(),
    effectivePricing: vi.fn(),
    userFind: vi.fn(),
    reportFind: vi.fn(),
    reportUpdate: vi.fn(),
  }));
vi.mock("@/lib/organization-credits", () => ({
  getResourceTenantOwner: tenantOwner,
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: effectivePricing,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFind },
    report: { findUnique: reportFind, update: reportUpdate },
  },
}));

import { POST } from "../route";

const OWNER_PRICING = new Proxy({}, { get: () => 77 });
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

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockResolvedValue({
    id: "member_a",
    organization: { country: "AU" },
    pricingConfig: null,
  });
  reportFind.mockResolvedValue(REPORT);
  reportUpdate.mockResolvedValue(REPORT);
});

describe("POST /api/reports/generate-cost-estimation — invited member (RA-7893)", () => {
  it("prices the report at the business owner's pricing", async () => {
    tenantOwner.mockResolvedValue("owner_a");
    effectivePricing.mockResolvedValue(OWNER_PRICING);

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(tenantOwner).toHaveBeenCalledWith("member_a", REPORT.createdAt);
    expect(effectivePricing).toHaveBeenCalledWith(expect.anything(), "owner_a");
    const json = await res.json();
    expect(JSON.stringify(json.costEstimation.data)).toContain("77");
  });

  it("keeps the owner's own pricing row for an owner's report", async () => {
    tenantOwner.mockResolvedValue("member_a");
    userFind.mockResolvedValue({
      id: "member_a",
      organization: { country: "AU" },
      pricingConfig: new Proxy({}, { get: () => 55 }),
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(effectivePricing).not.toHaveBeenCalled();
    const json = await res.json();
    expect(JSON.stringify(json.costEstimation.data)).toContain("55");
  });

  it("refuses when the report's business cannot be proven", async () => {
    tenantOwner.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect(effectivePricing).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });
});
