import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userGroupBy = vi.fn();
const userCount = vi.fn();
const stripeWebhookCount = vi.fn();
const activationEventGroupBy = vi.fn();
const subscriptionEventGroupBy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      groupBy: (...args: unknown[]) => userGroupBy(...args),
      count: (...args: unknown[]) => userCount(...args),
    },
    stripeWebhookEvent: {
      count: (...args: unknown[]) => stripeWebhookCount(...args),
    },
    activationEvent: {
      groupBy: (...args: unknown[]) => activationEventGroupBy(...args),
    },
    subscriptionEvent: {
      groupBy: (...args: unknown[]) => subscriptionEventGroupBy(...args),
    },
  },
}));

import { GET } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/business-metrics");
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userGroupBy.mockReset();
  userCount.mockReset();
  stripeWebhookCount.mockReset();
  activationEventGroupBy.mockReset();
  subscriptionEventGroupBy.mockReset();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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

function mockMetricsQueries() {
  userGroupBy.mockResolvedValue([
    { subscriptionPlan: "Monthly Plan", _count: { id: 2 } },
  ]);
  userCount.mockResolvedValue(1);
  stripeWebhookCount.mockResolvedValue(0);
  activationEventGroupBy.mockResolvedValue([]);
  subscriptionEventGroupBy.mockResolvedValue([]);
}

function signInOperator() {
  signInTenantAdmin();
  mockMetricsQueries();
  vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function expectAboutThirtyDaysAgo(value: unknown) {
  expect(value).toBeInstanceOf(Date);
  const age = Date.now() - (value as Date).getTime();
  expect(Math.abs(age - THIRTY_DAYS_MS)).toBeLessThan(60_000);
}

describe("GET /api/admin/business-metrics", () => {
  it("rejects stale ADMIN JWTs when the database role has been demoted", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "USER",
      organizationId: null,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { id: true, role: true, organizationId: true },
    });
    expect(userGroupBy).not.toHaveBeenCalled();
  });

  it("refuses a tenant ADMIN — platform MRR is not a tenant privilege (RA-7592)", async () => {
    signInTenantAdmin();
    mockMetricsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userGroupBy).not.toHaveBeenCalled();
  });

  it("returns metrics only for an allowlisted platform-support operator", async () => {
    signInTenantAdmin();
    mockMetricsQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", " other_user, admin-1 ");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    // RA-7419: the catalog Monthly Plan is $99 (lib/pricing.ts), not $79.
    expect(body.mrr).toBe(198);
    expect(body.payingCustomers).toBe(2);
  });

  it("prices yearly plans at the live $1,188 a year, as $99 a month (RA-7419)", async () => {
    signInOperator();
    userGroupBy.mockResolvedValue([
      { subscriptionPlan: "Yearly Plan - 70 Reports/Month", _count: { id: 1 } },
      { subscriptionPlan: "Yearly Plan", _count: { id: 1 } },
      { subscriptionPlan: "Monthly Plan - 50 Reports", _count: { id: 1 } },
    ]);

    const body = await (await GET(makeRequest())).json();

    expect(body.mrr).toBe(297);
    expect(body.planUnmatched).toBe(0);
  });

  it("reports trials started, activated and paid for the last 30 days (RA-7419)", async () => {
    signInOperator();
    userCount.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      "trialEndsAt" in args.where && !("subscriptionStatus" in args.where) ? 7 : 1,
    );
    activationEventGroupBy.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "u3" },
    ]);
    subscriptionEventGroupBy.mockResolvedValue([{ userId: "u1" }]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.last30Days).toMatchObject({ trialsStarted: 7, activated: 3, paid: 1 });

    const trialsCall = userCount.mock.calls
      .map((call) => call[0] as { where: Record<string, unknown> })
      .find((args) => "trialEndsAt" in args.where && !("subscriptionStatus" in args.where));
    expect(trialsCall?.where.trialEndsAt).toEqual({ not: null });
    expectAboutThirtyDaysAgo((trialsCall?.where.createdAt as { gte: unknown }).gte);

    const activation = activationEventGroupBy.mock.calls[0][0];
    expect(activation.by).toEqual(["userId"]);
    expect(activation.where.eventName).toBe("first_report_saved");
    expectAboutThirtyDaysAgo(activation.where.createdAt.gte);

    const paid = subscriptionEventGroupBy.mock.calls[0][0];
    expect(paid.by).toEqual(["userId"]);
    expect(paid.where.eventType).toEqual({
      in: ["SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_REACTIVATED"],
    });
    expectAboutThirtyDaysAgo(paid.where.createdAt.gte);
  });
});
