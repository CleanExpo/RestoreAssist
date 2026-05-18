import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood).
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

import {
  validateInterviewResponse,
  type AnsweredQuestionForValidation,
} from "../validate-interview-response";
import { callAnthropicWithFallback } from "../anthropic-gateway";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const ANSWERED: AnsweredQuestionForValidation[] = [
  {
    questionId: "q1",
    questionText: "What category of water is on site?",
    answer: "Category 3 sewage backflow",
  },
  {
    questionId: "q2",
    questionText: "What PPE did you wear?",
    answer: "Gloves only",
  },
];

describe("validateInterviewResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with normalised findings on well-formed JSON output", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(
        '{"findings":[{"questionId":"q1","severity":"error","message":"Category 3 water requires PPE per S500:2025 §10.6","suggestedFix":"Document PPE used"}]}',
      ) as any,
    });

    const r = await validateInterviewResponse({
      apiKey: "sk-resolved",
      answered: ANSWERED,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.findings).toHaveLength(1);
      expect(r.data.findings[0]).toEqual({
        questionId: "q1",
        severity: "error",
        message: "Category 3 water requires PPE per S500:2025 §10.6",
        suggestedFix: "Document PPE used",
      });
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("returns ok with empty findings array when model reports clean", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage('{"findings": []}') as any,
    });

    const r = await validateInterviewResponse({
      apiKey: "sk-resolved",
      answered: ANSWERED,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.findings).toEqual([]);
    }
  });

  it("gracefully falls back to empty findings when model output is not JSON", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage("all good") as any,
    });

    const r = await validateInterviewResponse({
      apiKey: "sk-resolved",
      answered: ANSWERED,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.findings).toEqual([]);
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await validateInterviewResponse({
      apiKey: "sk-resolved",
      answered: ANSWERED,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });
});
