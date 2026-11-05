import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({ prisma: {} }));

const { createMock, ctorMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  ctorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat: { completions: { create: typeof createMock } };
    constructor(opts: unknown) {
      ctorMock(opts);
      this.chat = { completions: { create: createMock } };
    }
  },
}));

import { callAIProvider } from "../ai-provider";
import {
  META_API_BASE_URL,
  META_DEFAULT_CHAT_MODEL,
} from "../workspace/provider-connections";

const SYNTHETIC_KEY = "LLM_1607358788850350_synthetic";

const metaIntegration = {
  id: "meta-1",
  name: "Meta Llama",
  apiKey: SYNTHETIC_KEY,
  provider: "meta" as const,
};

describe("callAIProvider — Meta branch", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorMock.mockReset();
    createMock.mockResolvedValue({
      choices: [{ message: { content: "hello from meta" } }],
    });
  });

  it("calls Meta Model API chat completions with the documented model", async () => {
    const out = await callAIProvider(metaIntegration, {
      prompt: "hi",
      system: "be terse",
      maxTokens: 128,
    });

    expect(out).toBe("hello from meta");
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: SYNTHETIC_KEY,
        baseURL: META_API_BASE_URL,
      }),
    );
    expect(META_API_BASE_URL).toBe("https://api.meta.ai/v1");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: META_DEFAULT_CHAT_MODEL,
        max_tokens: 128,
      }),
    );
    expect(META_DEFAULT_CHAT_MODEL).toBe("muse-spark-1.3");
  });

  it("throws when Meta returns no content, without the key in the error", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: "" } }] });
    await expect(
      callAIProvider(metaIntegration, { prompt: "hi" }),
    ).rejects.toThrow(/No content in Meta response/);
  });
});
