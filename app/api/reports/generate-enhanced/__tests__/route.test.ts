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
const canCreateReport = vi.fn();
const deductCreditsAndTrackUsage = vi.fn();
const refundCreditsAndTrackUsage = vi.fn();

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
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
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
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: (...args: unknown[]) => canCreateReport(...args),
  deductCreditsAndTrackUsage: (...args: unknown[]) =>
    deductCreditsAndTrackUsage(...args),
  refundCreditsAndTrackUsage: (...args: unknown[]) =>
    refundCreditsAndTrackUsage(...args),
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
  canCreateReport.mockReset();
  deductCreditsAndTrackUsage.mockReset();
  refundCreditsAndTrackUsage.mockReset();

  canCreateReport.mockResolvedValue({ allowed: true });
  deductCreditsAndTrackUsage.mockResolvedValue(undefined);
  refundCreditsAndTrackUsage.mockResolvedValue({ refunded: true });

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

  it("RA-6961: scopes the report update by userId, not just id", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: true,
      data: { enhancedReport: "Enhanced report body" },
    });
    reportUpdate.mockResolvedValueOnce({ id: "report-foreign" });

    await POST(
      makeRequest({
        reportId: "report-foreign",
        technicianNotes: "Water damage to bedroom wall.",
      }),
    );

    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-foreign", userId: "user-1" },
      }),
    );
  });

  it("RA-6961: a foreign reportId (P2025) returns 404 and mutates nothing else", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: true,
      data: { enhancedReport: "Enhanced report body" },
    });
    const notFound = Object.assign(new Error("Record not found"), {
      code: "P2025",
    });
    reportUpdate.mockRejectedValueOnce(notFound);

    const res = await POST(
      makeRequest({
        reportId: "report-belongs-to-another-tenant",
        technicianNotes: "Water damage to bedroom wall.",
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    // The scoped update is what threw P2025 — nothing downstream ran.
    expect(reportCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/reports/generate-enhanced — RA-6982 charge-before-create", () => {
  const createBody = { technicianNotes: "Water damage to bedroom wall." };

  it("charges BEFORE creating on the new-report path", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: true,
      data: { enhancedReport: "Enhanced report body" },
    });
    reportCreate.mockResolvedValueOnce({ id: "new-1" });

    const res = await POST(makeRequest(createBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deductCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(reportCreate).toHaveBeenCalledTimes(1);
    // Order: charge lands before the report row is created.
    expect(deductCreditsAndTrackUsage.mock.invocationCallOrder[0]).toBeLessThan(
      reportCreate.mock.invocationCallOrder[0],
    );
    expect(refundCreditsAndTrackUsage).not.toHaveBeenCalled();
  });

  it("at-cap past the advisory gate → atomic deduct 402, creates NO report row", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: true,
      data: { enhancedReport: "Enhanced report body" },
    });
    deductCreditsAndTrackUsage.mockRejectedValueOnce(
      new Error("INSUFFICIENT_CREDITS"),
    );

    const res = await POST(makeRequest(createBody));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.upgradeRequired).toBe(true);
    // The core fix: no free report is created when the charge fails.
    expect(reportCreate).not.toHaveBeenCalled();
    expect(refundCreditsAndTrackUsage).not.toHaveBeenCalled();
  });

  it("advisory gate blocks at-cap before AI, charge, or create", async () => {
    canCreateReport.mockResolvedValueOnce({
      allowed: false,
      reason: "Monthly report limit reached.",
    });

    const res = await POST(makeRequest(createBody));

    expect(res.status).toBe(402);
    expect(generateEnhancedReport).not.toHaveBeenCalled();
    expect(deductCreditsAndTrackUsage).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("post-charge create failure triggers exactly one refund, then surfaces the error", async () => {
    generateEnhancedReport.mockResolvedValueOnce({
      ok: true,
      data: { enhancedReport: "Enhanced report body" },
    });
    reportCreate.mockRejectedValueOnce(new Error("DB write failed"));

    const res = await POST(makeRequest(createBody));

    expect(res.status).toBe(500);
    expect(deductCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(refundCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(refundCreditsAndTrackUsage).toHaveBeenCalledWith("user-1");
  });
});
