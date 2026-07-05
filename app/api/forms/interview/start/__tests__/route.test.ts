/**
 * Cross-tenant IDOR regression — POST /api/forms/interview/start.
 *
 * The template lookup must be ownership-scoped (`findFirst` with
 * `OR: [{ userId }, { isSystemTemplate: true }]`) so a crafted
 * formTemplateId cannot bind an InterviewSession to another tenant's
 * private template. Previously this used `findUnique({ where: { id } })`
 * (id-only), the same IDOR class patched in forms/submit.
 *
 * No Idempotency-Key header is sent, so withIdempotency (real, unmocked)
 * passes straight through to the handler — same pattern as
 * app/api/forms/interview/complete/__tests__/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const findFirst = vi.fn();
const userFindUnique = vi.fn();
const interviewSessionCreate = vi.fn();
const generateQuestions = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/interview", () => ({
  QuestionGenerationEngine: {
    generateQuestions: (...args: unknown[]) => generateQuestions(...args),
  },
  INTERVIEW_QUESTION_LIBRARY: {},
  getQuestionsForSubscriptionTier: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    formTemplate: { findFirst: (...a: unknown[]) => findFirst(...a) },
    interviewSession: { create: (...a: unknown[]) => interviewSessionCreate(...a) },
  },
}));

import { POST } from "../route";

const CALLER = "user_1";
const OTHER = "user_2";

// A minimal in-memory template store the findFirst mock queries so the test
// exercises the real ownership predicate the route passes, not a hardcoded
// return value.
const templates = [
  { id: "tmpl_own", userId: CALLER, isSystemTemplate: false },
  { id: "tmpl_system", userId: OTHER, isSystemTemplate: true },
  { id: "tmpl_foreign", userId: OTHER, isSystemTemplate: false },
];

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/forms/interview/start", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: CALLER } });
  userFindUnique.mockResolvedValue({ id: CALLER, interviewTier: "STANDARD" });
  interviewSessionCreate.mockResolvedValue({ id: "sess_new" });
  generateQuestions.mockReturnValue({
    tieredQuestions: { tier1: [{ id: "q1" }], tier2: [], tier3: [] },
    estimatedDurationMinutes: 10,
    standardsCovered: [],
  });
  // Emulate the DB honouring the ownership-scoped where clause.
  findFirst.mockImplementation(async ({ where }: any) => {
    const orClauses: any[] = where.OR ?? [];
    return (
      templates.find(
        (t) =>
          t.id === where.id &&
          orClauses.some(
            (c) =>
              (c.userId !== undefined && c.userId === t.userId) ||
              (c.isSystemTemplate !== undefined &&
                c.isSystemTemplate === t.isSystemTemplate &&
                t.isSystemTemplate),
          ),
      ) ?? null
    );
  });
});

describe("POST /api/forms/interview/start — cross-tenant template IDOR", () => {
  it("scopes the template lookup to owner-or-system (not id-only)", async () => {
    await POST(makeRequest({ formTemplateId: "tmpl_own" }));

    expect(findFirst).toHaveBeenCalledTimes(1);
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.id).toBe("tmpl_own");
    expect(arg.where.OR).toEqual(
      expect.arrayContaining([
        { userId: CALLER },
        { isSystemTemplate: true },
      ]),
    );
  });

  it("404s and creates no session for another tenant's private template", async () => {
    const res = await POST(makeRequest({ formTemplateId: "tmpl_foreign" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(interviewSessionCreate).not.toHaveBeenCalled();
  });

  it("starts a session for the caller's own template", async () => {
    const res = await POST(makeRequest({ formTemplateId: "tmpl_own" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sessionId).toBe("sess_new");
    expect(interviewSessionCreate).toHaveBeenCalledTimes(1);
  });

  it("starts a session for a shared system template", async () => {
    const res = await POST(makeRequest({ formTemplateId: "tmpl_system" }));

    expect(res.status).toBe(200);
    expect(interviewSessionCreate).toHaveBeenCalledTimes(1);
  });
});
