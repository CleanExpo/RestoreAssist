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
});
