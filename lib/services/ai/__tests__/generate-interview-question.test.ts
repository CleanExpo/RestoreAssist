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
    vi.mocked(buildAiUsageMetadata).mockClear();
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

  it("uses fast classification policy metadata without changing the gateway request", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage('{"question":"X","isComplete":false}') as any,
    });

    const policy = requireAiTaskPolicy("fast_classification");

    await generateInterviewQuestion({
      apiKey: "sk-preserve",
      conversation: SHORT_CONVERSATION,
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
        system: [
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining(
              "You are a professional water damage restoration assistant",
            ),
          }),
        ],
        max_tokens: 500,
        messages: [
          { role: "assistant", content: "What rooms are affected?" },
          { role: "user", content: "The kitchen and the laundry." },
          {
            role: "user",
            content:
              "Generate the next question or conclusion as a JSON object with 'question' and 'isComplete' fields. If enough information has been gathered, set isComplete to true and provide a conclusion message.",
          },
        ],
      },
      agentName: "QuestionGenerator",
      enableCacheMetrics: true,
    });
  });

  it("fails closed for unknown task policies", () => {
    expect(() => requireAiTaskPolicy("unknown")).toThrow(
      "Missing AI task policy for unknown",
    );
  });
});
