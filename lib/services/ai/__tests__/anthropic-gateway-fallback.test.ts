import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: vi.fn(),
}));

const { mockTryClaudeModels, MockAPIError, MockAuthenticationError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  class MockAuthenticationError extends Error {
    status = 401;
  }
  return {
    mockTryClaudeModels: vi.fn(),
    MockAPIError,
    MockAuthenticationError,
  };
});

vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: mockTryClaudeModels,
  getClaudeModels: vi.fn(() => []),
}));

vi.mock("@anthropic-ai/sdk", () => {
  // vitest 4 requires `new`-able mocks be created from a function statement,
  // not an arrow — arrow funcs can't be constructors in JS at all and
  // vitest 3's previous wrapping behaviour was dropped.
  const Anthropic: any = vi.fn(function MockAnthropic(this: any) {
    return {};
  });
  Anthropic.APIError = MockAPIError;
  Anthropic.RateLimitError = class MockRateLimitError extends Error {
    status = 429;
  };
  Anthropic.AuthenticationError = MockAuthenticationError;
  return { default: Anthropic };
});

import { callAnthropicWithFallback } from "../anthropic-gateway";
import { getAnthropicApiKey } from "@/lib/ai-provider";

const baseReq = {
  userId: "user-1",
  request: {
    max_tokens: 100,
    messages: [{ role: "user" as const, content: "hi" }],
  },
};

describe("callAnthropicWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTryClaudeModels.mockReset();
    vi.mocked(getAnthropicApiKey).mockReset();
  });

  it("returns ok with the message on success", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    const fakeMessage = { id: "msg_1", content: [{ type: "text", text: "ok" }] };
    mockTryClaudeModels.mockResolvedValueOnce(fakeMessage);

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(fakeMessage);
  });

  it("returns KEY_MISSING when getAnthropicApiKey throws", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(new Error("no key"));

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("KEY_MISSING");
      expect(r.detail).toContain("no key");
    }
  });

  it("returns KEY_MISSING when getAnthropicApiKey returns empty string", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("");

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });

  it("returns KEY_INVALID when tryClaudeModels throws AuthenticationError", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockTryClaudeModels.mockRejectedValueOnce(new MockAuthenticationError("auth failed"));

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("KEY_INVALID");
      expect(r.detail).toContain("invalid or expired");
    }
  });

  it("returns RATE_LIMITED for 429 status throws", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockTryClaudeModels.mockRejectedValueOnce(new MockAPIError("rate limited", 429));

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns MODEL_OVERLOADED for 529 status throws", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockTryClaudeModels.mockRejectedValueOnce(new MockAPIError("overloaded", 529));

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns API_ERROR for any other throw (incl. pre-formatted usage-limit errors)", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockTryClaudeModels.mockRejectedValueOnce(
      new Error("API Usage Limit Reached: out of credit"),
    );

    const r = await callAnthropicWithFallback(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
      expect(r.detail).toContain("API Usage Limit");
    }
  });

  it("uses the apiKey override and skips getAnthropicApiKey", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(
      new Error("resolver should not be called"),
    );
    const fakeMessage = {
      id: "msg_override",
      content: [{ type: "text", text: "ok" }],
    };
    mockTryClaudeModels.mockResolvedValueOnce(fakeMessage);

    const r = await callAnthropicWithFallback({
      userId: "user-1",
      apiKey: "sk-override",
      request: baseReq.request,
    });
    expect(r.ok).toBe(true);
    expect(vi.mocked(getAnthropicApiKey)).not.toHaveBeenCalled();
  });

  it("passes through models + agentName + enableCacheMetrics options", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockTryClaudeModels.mockResolvedValueOnce({ id: "msg_x" });

    await callAnthropicWithFallback({
      ...baseReq,
      models: [{ name: "claude-foo", maxTokens: 4000 }] as any,
      agentName: "test-agent",
      enableCacheMetrics: true,
    });

    expect(mockTryClaudeModels).toHaveBeenCalledWith(
      expect.anything(),
      baseReq.request,
      [{ name: "claude-foo", maxTokens: 4000 }],
      { agentName: "test-agent", enableCacheMetrics: true },
    );
  });
});
