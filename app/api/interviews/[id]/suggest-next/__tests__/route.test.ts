import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const interviewFindFirst = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const suggestNextInterviewQuestion = vi.fn();

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
vi.mock("@/lib/services/ai/suggest-next-interview-question", () => ({
  suggestNextInterviewQuestion: (...args: unknown[]) =>
    suggestNextInterviewQuestion(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  interviewFindFirst.mockReset();
  resolveWorkspaceAiKey.mockReset();
  suggestNextInterviewQuestion.mockReset();

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
    "http://localhost/api/interviews/interview_1/suggest-next",
    {
      method: "POST",
      body: JSON.stringify({
        answeredQuestions: [
          { questionText: "What happened?", answer: "Burst pipe" },
          { questionText: "Which room?", answer: "Kitchen" },
          { questionText: "When was it found?", answer: "This morning" },
        ],
        remainingQuestions: [],
      }),
    },
  );
}

describe("POST /api/interviews/[id]/suggest-next", () => {
  it("does not expose provider failure details", async () => {
    suggestNextInterviewQuestion.mockResolvedValueOnce({
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
