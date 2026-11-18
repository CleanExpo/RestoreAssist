/**
 * L-2 paid-base-plan vs Founding Trial: tier 2+ saves are paid-plan features.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const featureEntitlementFindFirst = vi.fn();

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
    featureEntitlement: {
      findFirst: (...args: unknown[]) => featureEntitlementFindFirst(...args),
    },
  },
}));

import { POST } from "../route";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";
import { PAID_BASE_PLAN_MESSAGE } from "@/lib/billing/paid-base-plan-copy";

const DAY = 24 * 60 * 60 * 1000;

function makeRequest(tier = 2) {
  return new NextRequest(
    "http://localhost/api/reports/save-tier-responses",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: "report-1",
        tier,
        responses: { q1: "yes" },
      }),
    },
  );
}

function seedOwner(opts: {
  status: string;
  trialEndsAt: Date | null;
  founding: boolean;
}) {
  userFindUnique.mockResolvedValue({
    id: "user-1",
    role: "ADMIN",
    organizationId: "org-a",
    organization: { ownerId: "user-1" },
    subscriptionStatus: opts.status,
    trialEndsAt: opts.trialEndsAt,
    lifetimeAccess: false,
    creditsRemaining: 10,
  });
  featureEntitlementFindFirst.mockImplementation(
    async (args: { where?: { stripePriceId?: string } } = {}) =>
      opts.founding && args.where?.stripePriceId === COMPLIMENTARY_PRICE_ID
        ? { id: "fe_1" }
        : null,
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();
  featureEntitlementFindFirst.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  reportFindUnique.mockResolvedValue({
    id: "report-1",
    userId: "user-1",
    reportDepthLevel: null,
  });
  reportUpdate.mockResolvedValue({
    id: "report-1",
    userId: "user-1",
    tier2Responses: JSON.stringify({ q1: "yes" }),
  });
  featureEntitlementFindFirst.mockResolvedValue(null);
});

describe("POST /api/reports/save-tier-responses — founding-trial grant", () => {
  it("unexpired founding-trial grant gets 200 on tier 2", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 40 * DAY),
      founding: true,
    });
    const res = await POST(makeRequest(2));
    expect(res.status).toBe(200);
    expect(reportUpdate).toHaveBeenCalled();
  });

  it("expired founding-trial grant gets 402 on tier 2", async () => {
    seedOwner({
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() - DAY),
      founding: true,
    });
    const res = await POST(makeRequest(2));
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error.message).toBe(PAID_BASE_PLAN_MESSAGE);
    expect(reportUpdate).not.toHaveBeenCalled();
  });
});
