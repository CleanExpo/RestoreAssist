import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB client so importing the module does not construct a real
// PrismaClient (no generated engine in this env).
vi.mock("../prisma", () => ({ prisma: {} }));

// Capture the OpenAI SDK constructor + chat.completions.create call so we can
// assert the OpenRouter branch wires the right base URL and model without
// making a network request. vi.hoisted keeps these available inside the
// hoisted vi.mock factory.
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

const orIntegration = {
  id: "or-1",
  name: "OpenRouter",
  apiKey: "sk-or-v1-key",
  provider: "openrouter" as const,
};

describe("callAIProvider — OpenRouter branch", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorMock.mockReset();
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_SITE_URL;
    createMock.mockResolvedValue({
      choices: [{ message: { content: "hello from openrouter" } }],
    });
  });

  it("routes to the OpenRouter base URL and returns the completion text", async () => {
    const out = await callAIProvider(orIntegration, {
      prompt: "hi",
      system: "be terse",
    });

    expect(out).toBe("hello from openrouter");
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-or-v1-key",
        baseURL: "https://openrouter.ai/api/v1",
      }),
    );
    // Default model when the caller supplies none and no env override is set.
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "deepseek/deepseek-chat" }),
    );
  });

  it("prefers an explicit options.model over the OPENROUTER_MODEL env default", async () => {
    process.env.OPENROUTER_MODEL = "env/model";
    await callAIProvider(orIntegration, { prompt: "hi", model: "qwen/qwen-3" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "qwen/qwen-3" }),
    );
  });

  it("falls back to OPENROUTER_MODEL env when no options.model is given", async () => {
    process.env.OPENROUTER_MODEL = "env/model";
    await callAIProvider(orIntegration, { prompt: "hi" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "env/model" }),
    );
  });

  it("uses the integration's stored model over env, but under an explicit option", async () => {
    process.env.OPENROUTER_MODEL = "env/model";
    const withModel = { ...orIntegration, model: "workspace/stored-model" };

    // integration.model beats the env default
    await callAIProvider(withModel, { prompt: "hi" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "workspace/stored-model" }),
    );

    // a per-call options.model still wins over the stored model
    createMock.mockClear();
    await callAIProvider(withModel, { prompt: "hi", model: "call/override" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "call/override" }),
    );
  });

  it("sets the optional HTTP-Referer header only when OPENROUTER_SITE_URL is set", async () => {
    await callAIProvider(orIntegration, { prompt: "hi" });
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.not.objectContaining({ "HTTP-Referer": expect.anything() }),
      }),
    );

    ctorMock.mockReset();
    process.env.OPENROUTER_SITE_URL = "https://restoreassist.example";
    await callAIProvider(orIntegration, { prompt: "hi" });
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.objectContaining({
          "HTTP-Referer": "https://restoreassist.example",
        }),
      }),
    );
  });

  it("throws when OpenRouter returns no content", async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    await expect(
      callAIProvider(orIntegration, { prompt: "hi" }),
    ).rejects.toThrow(/No content in OpenRouter response/);
  });
});
