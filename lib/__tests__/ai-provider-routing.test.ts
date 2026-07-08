import { describe, it, expect, vi } from "vitest";

// Pure routing-logic unit test — stub the DB client so importing the module
// does not construct a real PrismaClient (no generated engine in this env).
vi.mock("../prisma", () => ({ prisma: {} }));

import { providerForKey, callAIProvider } from "../ai-provider";

describe("providerForKey — key-authoritative provider resolution (B1)", () => {
  it("classifies by key prefix, never by name", () => {
    expect(providerForKey("sk-ant-api03-abc")).toBe("anthropic");
    expect(providerForKey("sk-proj-abc123")).toBe("openai");
    expect(providerForKey("sk-abc123")).toBe("openai");
    expect(providerForKey("AIzaSyAbc123")).toBe("gemini");
    expect(providerForKey("unrecognised-format")).toBeNull();
    expect(providerForKey("")).toBeNull();
    expect(providerForKey(null)).toBeNull();
    expect(providerForKey(undefined)).toBeNull();
  });

  it("classifies OpenRouter keys before the generic OpenAI sk- prefix", () => {
    // OpenRouter keys start with sk-or-, which also matches the generic sk-
    // OpenAI branch — the sk-or- check must win or the key is misrouted to
    // api.openai.com and fails.
    expect(providerForKey("sk-or-v1-abcdef")).toBe("openrouter");
    expect(providerForKey("sk-or-abcdef")).toBe("openrouter");
    // Real OpenAI keys must still classify as openai (no false positives).
    expect(providerForKey("sk-proj-openaikey")).toBe("openai");
    expect(providerForKey("sk-openaikey")).toBe("openai");
  });
});

describe("callAIProvider — refuses cross-vendor key routing (B1)", () => {
  it("never sends an OpenAI key to the Anthropic endpoint, even if named 'Claude API'", async () => {
    await expect(
      callAIProvider(
        {
          id: "x",
          name: "Claude API",
          apiKey: "sk-proj-not-an-anthropic-key",
          provider: "anthropic",
        },
        { prompt: "hello" },
      ),
    ).rejects.toThrow(/does not match/i);
  });

  it("never sends a Gemini key to the Anthropic endpoint", async () => {
    await expect(
      callAIProvider(
        { id: "y", name: "Anthropic", apiKey: "AIzaSyGeminiKey", provider: "anthropic" },
        { prompt: "hello" },
      ),
    ).rejects.toThrow(/does not match/i);
  });

  it("never sends an OpenRouter key to the OpenAI endpoint", async () => {
    // sk-or- classifies as openrouter, so an integration mislabelled openai
    // must fail closed rather than hit api.openai.com with a key it will reject.
    await expect(
      callAIProvider(
        {
          id: "z",
          name: "OpenAI",
          apiKey: "sk-or-v1-actually-openrouter",
          provider: "openai",
        },
        { prompt: "hello" },
      ),
    ).rejects.toThrow(/does not match/i);
  });
});
