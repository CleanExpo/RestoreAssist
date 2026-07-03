import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropicStream: vi.fn(),
}));

import { generateScopeStream } from "../generate-scope";
import { callAnthropicStream } from "@/lib/services/ai/anthropic-gateway";

const baseArgs = {
  userId: "user-1",
  apiKey: "sk-ant-workspace",
  systemPrompt: "You are an IICRC certified scope writer.",
  userMessage: "Inspection payload: {...}",
  model: "claude-sonnet-4-6" as const,
};

describe("generateScopeStream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with the stream on success", async () => {
    const fakeStream = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
      abort: vi.fn(),
    };
    vi.mocked(callAnthropicStream).mockResolvedValueOnce({
      ok: true,
      data: fakeStream as never,
    });

    const r = await generateScopeStream(baseArgs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(fakeStream);
  });

  it("passes a system message with cache_control: ephemeral to the gateway", async () => {
    vi.mocked(callAnthropicStream).mockResolvedValueOnce({
      ok: true,
      data: {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
        }),
        abort: vi.fn(),
      } as never,
    });
    await generateScopeStream(baseArgs);

    expect(vi.mocked(callAnthropicStream)).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        // RA-6971 — the workspace's own key must be threaded to the gateway so
        // it is preferred over the platform ANTHROPIC_API_KEY.
        apiKey: "sk-ant-workspace",
        request: expect.objectContaining({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: [
            expect.objectContaining({
              type: "text",
              text: baseArgs.systemPrompt,
              cache_control: { type: "ephemeral" },
            }),
          ],
          messages: [{ role: "user", content: baseArgs.userMessage }],
        }),
      }),
    );
  });

  it("propagates gateway KEY_MISSING reason", async () => {
    vi.mocked(callAnthropicStream).mockResolvedValueOnce({
      ok: false,
      reason: "KEY_MISSING",
      detail: "no key for user",
    });
    const r = await generateScopeStream(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });
});
