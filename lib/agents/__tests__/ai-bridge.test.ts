import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIBridgeParams } from "../ai-bridge";

const resolveWorkspaceAiKey = vi.fn();
const tryClaudeModels = vi.fn();
const getClaudeModels = vi.fn();
const anthropicCtor = vi.fn();

vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: (...args: unknown[]) => tryClaudeModels(...args),
  getClaudeModels: (...args: unknown[]) => getClaudeModels(...args),
}));
vi.mock("@/lib/anthropic/features/prompt-cache", () => ({
  createCachedSystemPrompt: (text: string) => ({ type: "text", text }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  },
}));

import { callAI } from "../ai-bridge";

const baseParams: AIBridgeParams = {
  userId: "user_1",
  agentSlug: "report-analysis",
  systemPrompt: "system",
  userPrompt: "prompt",
};

beforeEach(() => {
  resolveWorkspaceAiKey.mockReset();
  tryClaudeModels.mockReset();
  anthropicCtor.mockReset();
  getClaudeModels.mockReturnValue([{ name: "claude-x", maxTokens: 8000 }]);
});

describe("callAI (agent AI bridge)", () => {
  it("fails closed when the workspace has no key — never spends the platform key", async () => {
    const { NoWorkspaceKeyError } = await import(
      "@/lib/ai/resolve-workspace-ai-key"
    );
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    await expect(callAI(baseParams)).rejects.toBeInstanceOf(
      NoWorkspaceKeyError,
    );
    // The platform-key path must never be reached — no client constructed, no
    // model call issued, so a keyless customer's workflow cannot bill the
    // platform ANTHROPIC_API_KEY.
    expect(anthropicCtor).not.toHaveBeenCalled();
    expect(tryClaudeModels).not.toHaveBeenCalled();
  });

  it("uses the resolved workspace key, not the platform key", async () => {
    resolveWorkspaceAiKey.mockResolvedValueOnce({
      workspaceId: "ws_1",
      apiKey: "sk-ant-workspace",
    });
    tryClaudeModels.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 5, output_tokens: 3 },
      model: "claude-x",
    });

    const result = await callAI(baseParams);

    expect(resolveWorkspaceAiKey).toHaveBeenCalledWith("user_1", "ANTHROPIC");
    expect(anthropicCtor).toHaveBeenCalledWith({ apiKey: "sk-ant-workspace" });
    expect(result.text).toBe("{}");
    expect(result.provider).toBe("anthropic");
  });
});
