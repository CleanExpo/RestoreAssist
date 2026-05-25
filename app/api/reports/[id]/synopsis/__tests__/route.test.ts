import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const reportFindFirst = vi.fn();
const reportUpdate = vi.fn();
const getAnthropicApiKey = vi.fn();
const generateReportSynopsis = vi.fn();

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
    },
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: (...args: unknown[]) => getAnthropicApiKey(...args),
}));
vi.mock("@/lib/services/ai/report-synopsis", () => ({
  generateReportSynopsis: (...args: unknown[]) =>
    generateReportSynopsis(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  reportFindFirst.mockReset();
  reportUpdate.mockReset();
  getAnthropicApiKey.mockReset();
  generateReportSynopsis.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  getAnthropicApiKey.mockResolvedValue("anthropic-key");
  reportFindFirst.mockResolvedValue({
    id: "report_1",
    clientName: "Client",
    propertyAddress: "1 Test St",
    waterCategory: "CATEGORY_2",
    waterClass: "CLASS_2",
    affectedArea: "Kitchen",
    estimatedDryingTime: "3 days",
    totalCost: 1000,
    hazardType: "Water",
    aiSynopsis: null,
    aiSynopsisAt: null,
    estimates: [],
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/reports/report_1/synopsis", {
    method: "POST",
  });
}

describe("POST /api/reports/[id]/synopsis", () => {
  it("does not expose provider failure details", async () => {
    generateReportSynopsis.mockResolvedValueOnce({
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
