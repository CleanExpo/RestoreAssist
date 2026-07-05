/**
 * RA-6989 — POST /api/forms/interview/complete route-level tests.
 *
 * Covers the fix:
 *   - 400 when sessionId is missing from the body.
 *   - 404 only for the genuine not-found case (service resolves null).
 *   - 500 (not 404) when the service throws — a transient DB failure must
 *     not read as "session not found" (the 404-vs-500 conflation this
 *     ticket closes), and the response must not leak error.message
 *     (CLAUDE.md rule 9).
 *   - 200 with the `{ success, metrics }` envelope on the happy path.
 *
 * RA-909 also covers the cross-tenant ownership pre-check:
 *   - a sessionId that resolves for a different owner 404s and never
 *     reaches trackSessionCompletion (the IDOR this ticket closes).
 *
 * No Idempotency-Key header is sent in any request, so withIdempotency
 * (real, unmocked) passes straight through to the handler — same pattern
 * as app/api/credits/use/__tests__/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const trackSessionCompletion = vi.fn();
const findFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/forms/analytics", () => ({
  InterviewAnalyticsService: {
    trackSessionCompletion: (...args: unknown[]) =>
      trackSessionCompletion(...args),
  },
}));
// lib/idempotency imports @/lib/prisma directly too; never touched by it in
// these tests since no Idempotency-Key header is sent (short-circuits
// before any query). The route itself now queries interviewSession.findFirst
// for the RA-909 ownership pre-check.
vi.mock("@/lib/prisma", () => ({
  prisma: { interviewSession: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/forms/interview/complete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  // Default: the session exists and belongs to the caller — individual
  // tests override this to exercise the not-found / cross-tenant paths.
  findFirst.mockResolvedValue({ id: "sess_1" });
});

describe("POST /api/forms/interview/complete — auth", () => {
  it("401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ sessionId: "sess_1" }));

    expect(res.status).toBe(401);
    expect(trackSessionCompletion).not.toHaveBeenCalled();
  });
});

describe("POST /api/forms/interview/complete — validation", () => {
  it("400 when sessionId is missing", async () => {
    const res = await POST(
      makeRequest({
        autoPopulatedFieldsCount: 1,
        averageConfidence: 0.5,
        conflictCount: 0,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(trackSessionCompletion).not.toHaveBeenCalled();
  });
});

describe("POST /api/forms/interview/complete — cross-tenant IDOR (RA-909)", () => {
  it("404s a foreign session id and never reaches trackSessionCompletion", async () => {
    // User B (user_1, per the default mock) posts User A's sessionId. The
    // ownership-scoped findFirst (id + userId) finds nothing for this
    // caller and returns null, exactly as it would against a real DB.
    findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ sessionId: "sess_owned_by_user_2" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "sess_owned_by_user_2", userId: "user_1" },
      select: { id: true },
    });
    expect(trackSessionCompletion).not.toHaveBeenCalled();
  });

  it("still succeeds for the genuine owner (findFirst resolves the session)", async () => {
    findFirst.mockResolvedValue({ id: "sess_1" });
    const metrics = {
      sessionId: "sess_1",
      userId: "user_1",
      formTemplateId: "template_1",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:02:00.000Z",
      totalDurationSeconds: 120,
      questionsAnswered: 4,
      totalQuestions: 8,
      completionRate: 50,
      status: "completed",
      autoPopulatedFieldsCount: 2,
      averageConfidence: 0.9,
      conflictCount: 0,
    };
    trackSessionCompletion.mockResolvedValue(metrics);

    const res = await POST(
      makeRequest({
        sessionId: "sess_1",
        autoPopulatedFieldsCount: 2,
        averageConfidence: 0.9,
        conflictCount: 0,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.metrics).toEqual(metrics);
    expect(trackSessionCompletion).toHaveBeenCalledWith("sess_1", 2, 0.9, 0);
  });
});

describe("POST /api/forms/interview/complete — 404 vs 500 (RA-6989)", () => {
  it("404s only when the service reports a genuine not-found (resolves null)", async () => {
    trackSessionCompletion.mockResolvedValue(null);

    const res = await POST(makeRequest({ sessionId: "sess_missing" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("500s (not 404) when the service throws — a transient DB failure is not 'not found'", async () => {
    trackSessionCompletion.mockRejectedValue(
      new Error("connection reset by peer"),
    );

    const res = await POST(makeRequest({ sessionId: "sess_1" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL");
    // RA-786 / CLAUDE.md rule 9: never leak error.message to the client.
    expect(JSON.stringify(json)).not.toContain("connection reset by peer");
  });
});

describe("POST /api/forms/interview/complete — happy path", () => {
  it("200s with the { success, metrics } envelope and forwards parsed body fields", async () => {
    const metrics = {
      sessionId: "sess_1",
      userId: "user_1",
      formTemplateId: "template_1",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:02:00.000Z",
      totalDurationSeconds: 120,
      questionsAnswered: 4,
      totalQuestions: 8,
      completionRate: 50,
      status: "completed",
      autoPopulatedFieldsCount: 2,
      averageConfidence: 0.9,
      conflictCount: 0,
    };
    trackSessionCompletion.mockResolvedValue(metrics);

    const res = await POST(
      makeRequest({
        sessionId: "sess_1",
        autoPopulatedFieldsCount: 2,
        averageConfidence: 0.9,
        conflictCount: 0,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.metrics).toEqual(metrics);
    expect(trackSessionCompletion).toHaveBeenCalledWith(
      "sess_1",
      2,
      0.9,
      0,
    );
  });
});
