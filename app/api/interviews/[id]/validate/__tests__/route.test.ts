import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const interviewFindFirst = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const validateInterviewResponse = vi.fn();

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
    interviewSession: {
      findFirst: (...args: unknown[]) => interviewFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/services/ai/validate-interview-response", () => ({
  validateInterviewResponse: (...args: unknown[]) =>
    validateInterviewResponse(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  interviewFindFirst.mockReset();
  resolveWorkspaceAiKey.mockReset();
  validateInterviewResponse.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: "user_1",
    subscriptionStatus: "ACTIVE",
  });
  interviewFindFirst.mockResolvedValue({ id: "interview_1" });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/interviews/interview_1/validate",
    {
      method: "POST",
      body: JSON.stringify({
        answeredQuestions: [
          {
            questionId: "q1",
            questionText: "What is the water category?",
            answer: "Category 2",
          },
        ],
      }),
    },
  );
}

describe("POST /api/interviews/[id]/validate", () => {
  it("returns 402 with the NoWorkspaceKeyError shape when the workspace has no key", async () => {
    const { NoWorkspaceKeyError } = await import(
      "@/lib/ai/resolve-workspace-ai-key"
    );
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "interview_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    // The customer workload must never reach the provider on no key.
    expect(validateInterviewResponse).not.toHaveBeenCalled();
  });

  it("does not expose provider failure details", async () => {
    validateInterviewResponse.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "interview_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal server error" });
  });
});
