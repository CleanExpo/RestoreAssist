import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateInterviewQuestion = vi.fn();

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
  },
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) =>
    resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));
vi.mock("@/lib/services/ai/generate-interview-question", () => ({
  generateInterviewQuestion: (...args: unknown[]) =>
    generateInterviewQuestion(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  resolveWorkspaceAiKey.mockReset();
  generateInterviewQuestion.mockReset();

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
});

function postRequest() {
  return new NextRequest("http://localhost/api/reports/generate-question", {
    method: "POST",
    body: JSON.stringify({
      conversation: [{ role: "user", content: "What happened?" }],
    }),
  });
}

describe("POST /api/reports/generate-question", () => {
  it("does not expose provider failure details", async () => {
    generateInterviewQuestion.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to generate question. Please check your API key and try again.",
    });
  });
});
