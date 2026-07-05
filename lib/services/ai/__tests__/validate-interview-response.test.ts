import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood).
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

vi.mock("@/lib/ai/usage-metadata", () => ({
  buildAiUsageMetadata: vi.fn(() => ({
    blocked: false,
    taskClass: "fast_classification",
    providerFamily: "anthropic-platform",
    maxEstimatedCostUsd: 0.02,
    tenantContextStatus: "present",
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: true,
  })),
}));

import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import { buildAiUsageMetadata } from "@/lib/ai/usage-metadata";
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
    vi.mocked(buildAiUsageMetadata).mockClear();
  });

  it("returns ok with normalised findings on well-formed JSON output", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(
        '{"findings":[{"questionId":"q1","severity":"error","message":"Category 3 water requires PPE per S500:2021 §10.6","suggestedFix":"Document PPE used"}]}',
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
        message: "Category 3 water requires PPE per S500:2021 §10.6",
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

  it("uses fast classification policy metadata without changing the gateway request", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage('{"findings": []}') as any,
    });

    const policy = requireAiTaskPolicy("fast_classification");

    await validateInterviewResponse({
      apiKey: "sk-preserve",
      answered: ANSWERED,
    });

    expect(policy).toEqual(
      expect.objectContaining({
        taskClass: "fast_classification",
        maxEstimatedCostUsd: 0.02,
        requiresUsageLogging: true,
        requiresBudgetCheck: true,
        allowsFallback: true,
      }),
    );
    expect(buildAiUsageMetadata).toHaveBeenCalledTimes(1);
    expect(buildAiUsageMetadata).toHaveBeenCalledWith({
      taskClass: "fast_classification",
      providerFamily: "anthropic-platform",
      tenantContext: { userId: "system" },
      executionMode: "synchronous",
    });
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
    expect(callAnthropicWithFallback).toHaveBeenCalledWith({
      userId: "system",
      apiKey: "sk-preserve",
      request: {
        system: expect.stringContaining(
          "You are an IICRC S500:2021 compliance reviewer",
        ),
        max_tokens: 1200,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: expect.stringContaining(
              "Validate these answers against IICRC S500:2021 and return findings.",
            ),
          },
        ],
      },
      models: [
        { name: "claude-haiku-4-5-20251001", maxTokens: 1200 },
        { name: "claude-haiku-4-5-20251001", maxTokens: 1200 },
      ],
      agentName: "InterviewValidate",
    });
  });

  it("fails closed for unknown task policies", () => {
    expect(() => requireAiTaskPolicy("unknown")).toThrow(
      "Missing AI task policy for unknown",
    );
  });
});
