import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: vi.fn(),
}));

// vi.mock factory is hoisted above top-level vars — use vi.hoisted() so the
// mock fn + error classes are also hoisted and reachable from the factory.
const { mockMessagesCreate, MockRateLimitError, MockAPIError, MockAuthenticationError } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    status = 429;
  }
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
    mockMessagesCreate: vi.fn(),
    MockRateLimitError,
    MockAPIError,
    MockAuthenticationError,
  };
});

vi.mock("@anthropic-ai/sdk", () => {
  // vitest 4: arrow-fn impl can't be `new`'d. Use a function statement.
  const Anthropic: any = vi.fn(function MockAnthropic(this: any) {
    return { messages: { create: mockMessagesCreate } };
  });
  Anthropic.RateLimitError = MockRateLimitError;
  Anthropic.APIError = MockAPIError;
  Anthropic.AuthenticationError = MockAuthenticationError;
  return { default: Anthropic };
});

import { callAnthropic } from "../anthropic-gateway";
import { getAnthropicApiKey } from "@/lib/ai-provider";

const baseReq = {
  userId: "user-1",
  request: {
    model: "claude-sonnet-4-6" as const,
    max_tokens: 100,
    messages: [{ role: "user" as const, content: "hi" }],
  },
};

describe("callAnthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesCreate.mockReset();
  });

  it("returns ok with the message on success", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    const fakeMessage = { id: "msg_1", content: [{ type: "text", text: "ok" }] };
    mockMessagesCreate.mockResolvedValueOnce(fakeMessage);

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(fakeMessage);
  });

  it("returns KEY_MISSING when getAnthropicApiKey throws", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(new Error("no key"));

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("KEY_MISSING");
      expect(r.detail).toContain("no key");
    }
  });

  it("returns KEY_MISSING when getAnthropicApiKey returns empty string", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("");

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });

  it("returns KEY_INVALID when SDK throws AuthenticationError", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesCreate.mockRejectedValueOnce(new MockAuthenticationError("auth failed"));

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("KEY_INVALID");
      expect(r.detail).toContain("invalid or expired");
    }
  });

  it("returns RATE_LIMITED when SDK throws RateLimitError", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesCreate.mockRejectedValueOnce(new MockRateLimitError("rate limited"));

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns MODEL_OVERLOADED when SDK throws APIError with status 529", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesCreate.mockRejectedValueOnce(new MockAPIError("overloaded", 529));

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns API_ERROR for any other SDK throw", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesCreate.mockRejectedValueOnce(new Error("network broke"));

    const r = await callAnthropic(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
      expect(r.detail).toContain("network broke");
    }
  });

  it("uses the provided apiKey override instead of calling getAnthropicApiKey", async () => {
    // Even if the resolver would throw, the override should win.
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(
      new Error("resolver should not be called"),
    );
    const fakeMessage = {
      id: "msg_override",
      content: [{ type: "text", text: "ok" }],
    };
    mockMessagesCreate.mockResolvedValueOnce(fakeMessage);

    const r = await callAnthropic({
      userId: "user-1",
      apiKey: "sk-override",
      request: baseReq.request,
    });
    expect(r.ok).toBe(true);
    expect(vi.mocked(getAnthropicApiKey)).not.toHaveBeenCalled();
  });
});
