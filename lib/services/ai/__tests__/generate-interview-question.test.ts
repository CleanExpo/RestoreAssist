import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the substrate helper directly — this service composes tryClaudeModels
// (multi-model fallback) rather than the single-model anthropic-gateway.
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: vi.fn(),
}));

// Prompt-cache helper is harmless but is imported by the service; stub it so
// the test doesn't need to evaluate the real cache-block builder.
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
import { tryClaudeModels } from "@/lib/anthropic-models";

function mockTextResponse(text: string) {
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
    vi.mocked(tryClaudeModels).mockReset();
  });

  it("returns ok with parsed question + isComplete when response is valid JSON", async () => {
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(
        '{"question":"Where did the water come from?","isComplete":false}',
      ),
    );

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.question).toBe("Where did the water come from?");
      expect(r.data.isComplete).toBe(false);
    }
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
  });

  it("auto-completes on non-JSON response once conversation has reached the 6-turn threshold", async () => {
    const plainText = "Thank you for the information";
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(plainText),
    );

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

  it("maps 429 from tryClaudeModels to RATE_LIMITED", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce({
      status: 429,
      message: "rate limit",
    });

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });

  it("maps a generic throw to API_ERROR", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce(
      new Error("network broke"),
    );

    const r = await generateInterviewQuestion({
      apiKey: "sk-resolved",
      conversation: SHORT_CONVERSATION,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
    }
  });
});
