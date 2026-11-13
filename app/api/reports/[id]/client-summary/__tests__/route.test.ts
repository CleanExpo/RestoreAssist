import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const userUpdateMany = vi.fn();
const userInviteFindFirst = vi.fn();
const reportFindFirst = vi.fn();
const reportUpdate = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateClientSummaryService = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      updateMany: (...args: unknown[]) => userUpdateMany(...args),
    },
    userInvite: {
      findFirst: (...args: unknown[]) => userInviteFindFirst(...args),
    },
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) =>
    resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/services/ai/generate-client-summary", () => ({
  generateClientSummaryService: (...args: unknown[]) =>
    generateClientSummaryService(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  userUpdateMany.mockReset();
  userInviteFindFirst.mockReset().mockResolvedValue(null);
  reportFindFirst.mockReset();
  reportUpdate.mockReset();
  resolveWorkspaceAiKey.mockReset();
  generateClientSummaryService.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
  reportFindFirst.mockResolvedValue({
    id: "report_1",
    propertyAddress: "1 Test St",
    hazardType: "Water",
    waterCategory: "CATEGORY_2",
    waterClass: "CLASS_2",
    affectedArea: "Kitchen",
    estimatedDryingTime: "3 days",
    sourceOfWater: "Burst pipe",
    safetyHazards: null,
    biologicalMouldDetected: false,
    scopeOfWorksDocument: "Dry affected area",
    clientSummaryCache: null,
    clientSummaryCachedAt: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/reports/report_1/client-summary",
    { method: "POST" },
  );
}

describe("POST /api/reports/[id]/client-summary", () => {
  it("does not expose provider failure details", async () => {
    generateClientSummaryService.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });
});

describe("POST /api/reports/[id]/client-summary — RA-7893 invited technician", () => {
  it("charges the trial credit to the business owner, not the technician", async () => {
    const rows: Record<string, Record<string, unknown>> = {
      user_1: {
        id: "user_1",
        role: "USER",
        organizationId: "org_1",
        organization: { ownerId: "owner_1" },
        subscriptionStatus: null,
        creditsRemaining: null,
      },
      owner_1: {
        id: "owner_1",
        role: "ADMIN",
        organizationId: "org_1",
        organization: { ownerId: "owner_1" },
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2099-01-01"),
        creditsRemaining: 5,
      },
    };
    userFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
    );
    // user_1 joined org_1 before report_1 was created.
    userInviteFindFirst.mockImplementation(
      async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === "org_1"
          ? { usedAt: new Date("2026-05-01T00:00:00Z") }
          : null,
    );
    userUpdateMany.mockResolvedValue({ count: 1 });
    generateClientSummaryService.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "stop after the charge",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).not.toBe(402);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany.mock.calls[0][0].where).toEqual({
      id: "owner_1",
      creditsRemaining: { gte: 1 },
    });
  });
});

describe("POST /api/reports/[id]/client-summary — RA-7893 P1-MOVED-MEMBER-CHARGES-NEW-OWNER", () => {
  it("does not charge or gate on org B's owner for a report the technician created in org A before moving", async () => {
    // report_1 (created 1 June) is still user_1's. user_1 has since left
    // org A and accepted an invite into org B on 1 July; owner_b has a
    // current trial with credits.
    const rows: Record<string, Record<string, unknown>> = {
      user_1: {
        id: "user_1",
        role: "USER",
        organizationId: "org_b",
        organization: { ownerId: "owner_b" },
        email: "user_1@example.com",
        subscriptionStatus: null,
        creditsRemaining: null,
      },
      owner_b: {
        id: "owner_b",
        role: "ADMIN",
        organizationId: "org_b",
        organization: { ownerId: "owner_b" },
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2099-01-01"),
        creditsRemaining: 5,
      },
    };
    userFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
    );
    userInviteFindFirst.mockImplementation(
      async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === "org_b"
          ? { usedAt: new Date("2026-07-01T00:00:00Z") }
          : null,
    );
    userUpdateMany.mockResolvedValue({ count: 1 });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(generateClientSummaryService).not.toHaveBeenCalled();
    expect(response.status).toBe(402);
  });
});
