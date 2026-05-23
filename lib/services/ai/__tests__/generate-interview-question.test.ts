import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood)
// rather than calling tryClaudeModels directly.
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

vi.mock("@/lib/anthropic/features/prompt-cache", () => ({
  createCachedSystemPrompt: (text: string) => ({
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }),
}));

import {
  generateInterviewQuestion,
  type ConversationMessage,
} from "../generate-interview-question";
import { callAnthropicWithFallback } from "../anthropic-gateway";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const SHORT_CONVERSATION: ConversationMessage[] = [
  { role: "assistant", content: "What rooms are affected?" },
  { role: "user", content: "The kitchen and the laundry." },
];

const SIX_TURN_CONVERSATION: ConversationMessage[] = [
  { role: "assistant", content: "What rooms are affected?" },
  { role: "user", content: "Kitchen and laundry." },
  { role: "assistant", content: "Where did the water come from?" },
  { role: "user", content: "Burst pipe under the sink." },
  { role: "assistant", content: "When did this happen?" },
  { role: "user", content: "About two hours ago." },
];

describe("generateInterviewQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with parsed question + isComplete when response is valid JSON", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(
        '{"question":"Where did the water come from?","isComplete":false}',
      ) as any,
    });

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.question).toBe("Where did the water come from?");
      expect(r.data.isComplete).toBe(false);
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("auto-completes on non-JSON response once conversation has reached the 6-turn threshold", async () => {
    const plainText = "Thank you for the information";
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(plainText) as any,
    });

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SIX_TURN_CONVERSATION,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.question).toBe(plainText);
      expect(r.data.isComplete).toBe(true);
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("forwards API_ERROR from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "network broke",
    });

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
    }
  });

  it("passes the resolved apiKey through to the gateway as override", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage('{"question":"X","isComplete":false}') as any,
    });

    await generateInterviewQuestion({
      apiKey: "sk-passthrough",
      conversation: SHORT_CONVERSATION,
    });

    expect(callAnthropicWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-passthrough",
        agentName: "QuestionGenerator",
        enableCacheMetrics: true,
      }),
    );
  });
});
