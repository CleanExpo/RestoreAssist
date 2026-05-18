import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMessagesStream = vi.fn();

const hoisted = vi.hoisted(() => {
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
  return { MockRateLimitError, MockAPIError };
});

vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  const Anthropic: any = vi
    .fn()
    .mockImplementation(() => ({ messages: { stream: mockMessagesStream } }));
  Anthropic.RateLimitError = hoisted.MockRateLimitError;
  Anthropic.APIError = hoisted.MockAPIError;
  return { default: Anthropic };
});

import { callAnthropicStream } from "../anthropic-gateway";
import { getAnthropicApiKey } from "@/lib/ai-provider";

const baseReq = {
  userId: "user-1",
  request: {
    model: "claude-sonnet-4-6" as const,
    max_tokens: 100,
    messages: [{ role: "user" as const, content: "hi" }],
  },
};

function fakeStream(): unknown {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
    abort: vi.fn(),
    finalMessage: vi.fn(),
  };
}

describe("callAnthropicStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesStream.mockReset();
  });

  it("returns ok with the stream on success", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    const stream = fakeStream();
    mockMessagesStream.mockReturnValueOnce(stream);

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(stream);
  });

  it("returns KEY_MISSING when getAnthropicApiKey throws", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(new Error("no key"));
    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("KEY_MISSING");
      expect(r.detail).toContain("no key");
    }
  });

  it("returns KEY_MISSING when getAnthropicApiKey returns empty string", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("");
    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });

  it("uses the provided apiKey override instead of calling getAnthropicApiKey", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(
      new Error("should not be called"),
    );
    mockMessagesStream.mockReturnValueOnce(fakeStream());

    const r = await callAnthropicStream({ ...baseReq, apiKey: "sk-override" });
    expect(r.ok).toBe(true);
    expect(vi.mocked(getAnthropicApiKey)).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED when SDK throws synchronously with RateLimitError", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new hoisted.MockRateLimitError("rate limited");
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns MODEL_OVERLOADED on synchronous APIError status 529", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new hoisted.MockAPIError("overloaded", 529);
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns API_ERROR on any other synchronous throw", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new Error("network broke");
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
      expect(r.detail).toContain("network broke");
    }
  });
});
