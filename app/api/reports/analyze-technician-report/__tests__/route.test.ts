import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const analyseTechnicianReport = vi.fn();

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
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) =>
    resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/services/ai/analyse-technician-report", () => ({
  analyseTechnicianReport: (...args: unknown[]) =>
    analyseTechnicianReport(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();
  resolveWorkspaceAiKey.mockReset();
  analyseTechnicianReport.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: "user_1",
    subscriptionStatus: "ACTIVE",
  });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
  reportFindUnique.mockResolvedValue({
    id: "report_1",
    technicianFieldReport: "Technician notes",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    incidentDate: new Date("2026-05-01T00:00:00Z"),
    technicianAttendanceDate: new Date("2026-05-02T00:00:00Z"),
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/reports/analyze-technician-report",
    {
      method: "POST",
      body: JSON.stringify({ reportId: "report_1" }),
    },
  );
}

describe("POST /api/reports/analyze-technician-report", () => {
  it("does not expose provider failure details", async () => {
    analyseTechnicianReport.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Failed to analyze technician report" });
  });
});
