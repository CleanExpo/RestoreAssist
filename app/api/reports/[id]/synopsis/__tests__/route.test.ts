import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const reportFindFirst = vi.fn();
const reportUpdate = vi.fn();
const getLatestAIIntegration = vi.fn();
const generateReportSynopsis = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

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
  getLatestAIIntegration: (...args: unknown[]) =>
    getLatestAIIntegration(...args),
}));
vi.mock("@/lib/services/ai/report-synopsis", () => ({
  generateReportSynopsis: (...args: unknown[]) =>
    generateReportSynopsis(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  reportFindFirst.mockReset();
  reportUpdate.mockReset();
  getLatestAIIntegration.mockReset();
  generateReportSynopsis.mockReset();
  resolveWorkspaceAiKey.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
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

  it("RA-6921: falls back to a legacy Settings -> Integrations Anthropic key when no workspace BYOK key is configured", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );
    getLatestAIIntegration.mockResolvedValueOnce({
      id: "integration_1",
      name: "Anthropic Claude",
      apiKey: "legacy-anthropic-key",
      provider: "anthropic",
    });
    generateReportSynopsis.mockResolvedValueOnce({
      ok: true,
      data: "A concise synopsis.",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(200);
    expect(generateReportSynopsis).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "legacy-anthropic-key" }),
    );
  });

  it("RA-6941: returns 402 KEY_MISSING (never the platform key) when neither a workspace nor a legacy key exists", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );
    getLatestAIIntegration.mockResolvedValueOnce(null);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ error: "KEY_MISSING" });
    expect(generateReportSynopsis).not.toHaveBeenCalled();
  });
});
