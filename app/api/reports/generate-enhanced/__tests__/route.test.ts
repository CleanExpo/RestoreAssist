import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const withIdempotency = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateEnhancedReport = vi.fn();
const userFindUnique = vi.fn();
const reportCreate = vi.fn();
const reportUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: Request,
    userId: string,
    fn: (rawBody: string) => Promise<Response>,
  ) => withIdempotency(req, userId, fn),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) =>
    resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/services/ai/generate-enhanced-report", () => ({
  generateEnhancedReport: (...args: unknown[]) =>
    generateEnhancedReport(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: {
      create: (...args: unknown[]) => reportCreate(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/reports/generate-enhanced", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  withIdempotency.mockReset();
  resolveWorkspaceAiKey.mockReset();
  generateEnhancedReport.mockReset();
  userFindUnique.mockReset();
  reportCreate.mockReset();
  reportUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  withIdempotency.mockImplementation(
    async (
      req: Request,
      _userId: string,
      fn: (rawBody: string) => Promise<Response>,
    ) => fn(await req.text()),
  );
  userFindUnique.mockResolvedValue({
    id: "user-1",
    name: "Taylor",
    email: "taylor@example.com",
    subscriptionStatus: "ACTIVE",
    creditsRemaining: 10,
    totalCreditsUsed: 0,
  });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws-1",
    apiKey: "anthropic-key",
  });
});

describe("POST /api/reports/generate-enhanced", () => {
  it("does not leak provider detail on internal generation failures", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider stack trace with sensitive request metadata",
    });

    const res = await POST(
      makeRequest({
        reportId: "report-1",
        technicianNotes: "Water damage to bedroom wall.",
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to generate enhanced report" });
  });

  it("keeps transient model failures bounded and retryable", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: false,
      reason: "MODEL_OVERLOADED",
      detail: "upstream overload diagnostic",
      retryAfterMs: 4500,
    });

    const res = await POST(
      makeRequest({
        reportId: "report-1",
        technicianNotes: "Water damage to bedroom wall.",
      }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    const body = await res.json();
    expect(body).toEqual({
      error: "AI service temporarily unavailable. Please try again.",
    });
  });
});
