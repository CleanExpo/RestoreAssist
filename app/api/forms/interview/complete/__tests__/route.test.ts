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
 * No Idempotency-Key header is sent in any request, so withIdempotency
 * (real, unmocked) passes straight through to the handler — same pattern
 * as app/api/credits/use/__tests__/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const trackSessionCompletion = vi.fn();

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
// lib/idempotency imports @/lib/prisma directly; never touched here since
// no Idempotency-Key header is sent (short-circuits before any query).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

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
