import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood).
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

import {
  suggestNextInterviewQuestion,
  type AnsweredQuestion,
  type RemainingQuestion,
} from "../suggest-next-interview-question";
import { callAnthropicWithFallback } from "../anthropic-gateway";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const ANSWERED: AnsweredQuestion[] = [
  { questionText: "Which rooms are affected?", answer: "Kitchen and laundry" },
  { questionText: "Source of water?", answer: "Toilet overflow" },
  { questionText: "When did it occur?", answer: "About 2 hours ago" },
];

const REMAINING: RemainingQuestion[] = [
  { questionText: "Have you photographed the damaged areas?" },
  { questionText: "Are there any vulnerable occupants on site?" },
];

describe("suggestNextInterviewQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with parsed question + reasoning on valid JSON suggestion", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(
        '{"question": "Did the water source involve sewage?", "reasoning": "Prior answer 2 mentions a toilet overflow."}',
      ) as any,
    });

    const r = await suggestNextInterviewQuestion({
      apiKey: "sk-resolved",
      answered: ANSWERED,
      remaining: REMAINING,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({
        question: "Did the water source involve sewage?",
        reasoning: "Prior answer 2 mentions a toilet overflow.",
      });
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("returns ok with question=null + reason on explicit null question", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(
        '{"question": null, "reasoning": "all covered"}',
      ) as any,
    });

    const r = await suggestNextInterviewQuestion({
      apiKey: "sk-resolved",
      answered: ANSWERED,
      remaining: REMAINING,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ question: null, reason: "all covered" });
    }
  });

  it("gracefully falls back to question=null when model output is not JSON", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage("I cannot suggest a question") as any,
    });

    const r = await suggestNextInterviewQuestion({
      apiKey: "sk-resolved",
      answered: ANSWERED,
      remaining: REMAINING,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ question: null, reason: "all covered" });
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await suggestNextInterviewQuestion({
      apiKey: "sk-resolved",
      answered: ANSWERED,
      remaining: REMAINING,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });
});
