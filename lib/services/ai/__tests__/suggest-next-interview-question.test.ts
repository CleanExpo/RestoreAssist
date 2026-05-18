import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the substrate helper directly — this service composes tryClaudeModels
// (multi-model fallback) rather than the single-model anthropic-gateway.
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: vi.fn(),
}));

import {
  suggestNextInterviewQuestion,
  type AnsweredQuestion,
  type RemainingQuestion,
} from "../suggest-next-interview-question";
import { tryClaudeModels } from "@/lib/anthropic-models";

function mockTextResponse(text: string) {
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
    vi.mocked(tryClaudeModels).mockReset();
  });

  it("returns ok with parsed question + reasoning on valid JSON suggestion", async () => {
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(
        '{"question": "Did the water source involve sewage?", "reasoning": "Prior answer 2 mentions a toilet overflow."}',
      ),
    );

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
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
  });

  it("returns ok with question=null + reason on explicit null question", async () => {
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse('{"question": null, "reasoning": "all covered"}'),
    );

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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse("I cannot suggest a question"),
    );

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

  it("maps 429 from tryClaudeModels to RATE_LIMITED", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce({
      status: 429,
      message: "rate limit",
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
