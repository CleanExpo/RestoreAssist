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
vi.mock("@/lib/report-limits", () => ({ deductCreditsAndTrackUsage: vi.fn() }));
vi.mock("@/lib/ai/adjuster-agent", () => ({ runAdjusterAgent: vi.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { deductCreditsAndTrackUsage } from "@/lib/report-limits";
import { runAdjusterAgent } from "@/lib/ai/adjuster-agent";
import { POST } from "../route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockRateLimit = applyRateLimit as ReturnType<typeof vi.fn>;
const mockDeductCredits = deductCreditsAndTrackUsage as ReturnType<
  typeof vi.fn
>;
const mockRunAgent = runAdjusterAgent as ReturnType<typeof vi.fn>;

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
  mockRunAgent.mockResolvedValue(sampleRecommendation);
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
  });

  it("unauthorized — no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ inspectionId: "insp-001" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
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
    expect(json.error).toMatch(/subscription/i);
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
    expect(json.error).toMatch(/credits/i);
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
    expect(json.error).toMatch(/inspectionId/i);
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
    expect(json.error).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("Internal AI failure detail");
  });
});
