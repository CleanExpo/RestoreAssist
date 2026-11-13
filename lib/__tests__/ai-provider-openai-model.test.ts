import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB client so importing the module does not construct a real
// PrismaClient (no generated engine in this env).
vi.mock("../prisma", () => ({ prisma: {} }));

// Capture chat.completions.create so we can assert the OpenAI branch sends a
// model the vendor still serves, without making a network request.
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

const openaiIntegration = {
  id: "oa-1",
  name: "OpenAI",
  apiKey: "sk-proj-test",
  provider: "openai" as const,
};

describe("callAIProvider — OpenAI branch model", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorMock.mockReset();
    createMock.mockResolvedValue({
      choices: [{ message: { content: "hello from openai" } }],
    });
  });

  it("[retired-models] sends gpt-5.4-mini, not the shut-down gpt-4-turbo-preview", async () => {
    const out = await callAIProvider(openaiIntegration, {
      prompt: "hi",
      system: "be terse",
    });

    expect(out).toBe("hello from openai");
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-proj-test" }),
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].model).toBe("gpt-5.4-mini");
  });

  it("[retired-models] keeps the 4096 completion-token cap", async () => {
    await callAIProvider(openaiIntegration, {
      prompt: "hi",
      maxTokens: 16000,
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.4-mini", max_tokens: 4096 }),
    );
  });
});
