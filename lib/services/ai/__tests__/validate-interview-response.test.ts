import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the substrate helper directly — this service composes tryClaudeModels
// (multi-model fallback) rather than the single-model anthropic-gateway.
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: vi.fn(),
}));

import {
  validateInterviewResponse,
  type AnsweredQuestionForValidation,
} from "../validate-interview-response";
import { tryClaudeModels } from "@/lib/anthropic-models";

function mockTextResponse(text: string) {
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
    vi.mocked(tryClaudeModels).mockReset();
  });

  it("returns ok with normalised findings on well-formed JSON output", async () => {
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(
        '{"findings":[{"questionId":"q1","severity":"error","message":"Category 3 water requires PPE per S500:2025 §10.6","suggestedFix":"Document PPE used"}]}',
      ),
    );

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
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
  });

  it("returns ok with empty findings array when model reports clean", async () => {
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse('{"findings": []}'),
    );

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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse("all good"),
    );

    const r = await validateInterviewResponse({
      apiKey: "sk-resolved",
      answered: ANSWERED,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.findings).toEqual([]);
    }
  });

  it("maps 429 from tryClaudeModels to RATE_LIMITED", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce({
      status: 429,
      message: "rate limit",
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
