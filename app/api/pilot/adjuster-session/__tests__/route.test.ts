/**
 * RA-1131: Route tests for POST /api/pilot/adjuster-session
 *
 * Mocks: next-auth, prisma, rate-limiter, report-limits, adjuster-agent.
 * No real DB or AI calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/report-limits", () => ({
  deductCreditsAndTrackUsage: vi.fn(),
  refundCreditsAndTrackUsage: vi.fn(),
}));
vi.mock("@/lib/ai/adjuster-agent", () => ({ runAdjusterAgent: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  deductCreditsAndTrackUsage,
  refundCreditsAndTrackUsage,
} from "@/lib/report-limits";
import { runAdjusterAgent } from "@/lib/ai/adjuster-agent";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockRateLimit = applyRateLimit as ReturnType<typeof vi.fn>;
const mockDeductCredits = deductCreditsAndTrackUsage as ReturnType<
  typeof vi.fn
>;
const mockRefundCredits = refundCreditsAndTrackUsage as ReturnType<
  typeof vi.fn
>;
const mockRunAgent = runAdjusterAgent as ReturnType<typeof vi.fn>;
const mockAssertInspectionTenancy = assertInspectionTenancy as ReturnType<
  typeof vi.fn
>;

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/pilot/adjuster-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sampleRecommendation = {
  recommendation: "approve",
  findings: [],
  clauseCompliance: [],
  anomalies: [],
  costReasonableness: "within-range",
  suggestedQuestions: [],
  inspectionId: "insp-001",
  generatedAt: "2026-04-17T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockDeductCredits.mockResolvedValue(undefined);
  mockRefundCredits.mockResolvedValue({ refunded: true });
  mockRunAgent.mockResolvedValue(sampleRecommendation);
  // Owns-the-inspection by default; individual tests override to simulate
  // a cross-tenant inspectionId.
  mockAssertInspectionTenancy.mockResolvedValue({
    ok: true,
    data: { id: "insp-001", userId: "user-1", workspaceId: null },
  });
});

describe("POST /api/pilot/adjuster-session", () => {
  it("happy path — returns recommendation", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-1",
      subscriptionStatus: "ACTIVE",
    });

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recommendation).toBe("approve");
    expect(mockRunAgent).toHaveBeenCalledWith("insp-001");
    expect(mockAssertInspectionTenancy).toHaveBeenCalledWith(
      { user: { id: "user-1" } },
      "insp-001",
    );
    // Success path: the credit is consumed exactly once and never refunded.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("cross-tenant inspectionId (RA-6961) — tenancy denied → 404, mutates nothing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-9" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-9",
      subscriptionStatus: "ACTIVE",
    });
    mockAssertInspectionTenancy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const res = await POST(
      makeRequest({ inspectionId: "insp-belongs-to-another-tenant" }),
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Inspection not found");
    // The tenancy gate must run BEFORE the credit deduction and the agent
    // call — neither side effect may fire for a foreign inspectionId.
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("unauthorized — no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.message).toBe("Unauthorized");
  });

  it("canceled subscription → 402", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-2" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-2",
      subscriptionStatus: "CANCELED",
    });

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error.message).toMatch(/subscription/i);
  });

  it("no credits remaining → 402", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-3" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-3",
      subscriptionStatus: "TRIAL",
    });
    mockDeductCredits.mockRejectedValueOnce(new Error("INSUFFICIENT_CREDITS"));

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error.message).toMatch(/credits/i);
  });

  it("RA-6981: a deduct 'not found' error is NOT mislabelled 404 'Inspection not found'", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-11" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-11",
      subscriptionStatus: "ACTIVE",
    });
    // deductCreditsAndTrackUsage can throw "Admin user not found" — a generic
    // internal failure that must map to 500, not a misleading 404 about the
    // inspection. The outer catch now narrows to `startsWith("Inspection not
    // found")`, which this message does not match.
    mockDeductCredits.mockRejectedValueOnce(new Error("Admin user not found"));

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.message).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("Inspection not found");
    // A pre-agent deduct failure never reaches the agent nor the refund path.
    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("missing inspectionId → 400", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-4" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-4",
      subscriptionStatus: "ACTIVE",
    });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/inspectionId/i);
  });

  it("inspection not found → 404", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-5" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-5",
      subscriptionStatus: "ACTIVE",
    });
    mockRunAgent.mockRejectedValueOnce(
      new Error("Inspection not found: insp-999"),
    );

    const res = await POST(makeRequest({ inspectionId: "insp-999" }));

    expect(res.status).toBe(404);
    // RA-6968 — a post-deduct agent failure must refund the charge (net-zero),
    // so the user is never billed for a report they never received.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith("user-5");
  });

  it("LIFETIME subscription → allowed through gate", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-6" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-6",
      subscriptionStatus: "LIFETIME",
    });

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(200);
  });

  it("rate limited → returns rate limit response", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-7" } });
    const rateLimitResponse = new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429 },
    );
    mockRateLimit.mockResolvedValueOnce(rateLimitResponse);

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(429);
  });

  it("AI agent throws unexpected error → 500, no error.message exposed", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-8" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-8",
      subscriptionStatus: "ACTIVE",
    });
    mockRunAgent.mockRejectedValueOnce(new Error("Internal AI failure detail"));

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.message).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("Internal AI failure detail");
    // RA-6968 — even on an unexpected 500 the deducted credit is refunded, so
    // a transient agent failure can't silently burn a paying user's quota.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith("user-8");
  });

  it("agent failure refund is best-effort — a failed refund does not change the surfaced error", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-10" } });
    mockFindUnique.mockResolvedValueOnce({
      id: "user-10",
      subscriptionStatus: "ACTIVE",
    });
    mockRunAgent.mockRejectedValueOnce(new Error("Adjuster agent 404"));
    // Even if the refund could not fully complete, the route must still return
    // the original failure (never mask it, never crash).
    mockRefundCredits.mockResolvedValueOnce({ refunded: false });

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(500);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith("user-10");
  });
});
