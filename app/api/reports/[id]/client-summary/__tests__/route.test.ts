import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const userUpdateMany = vi.fn();
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
