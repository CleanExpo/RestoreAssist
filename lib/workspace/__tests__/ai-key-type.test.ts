import { describe, expect, it } from "vitest";
import {
  aiProviderToCallProvider,
  uiAiKeyTypeToProvider,
} from "@/lib/workspace/ai-key-type";

describe("ai-key-type mapping (Wave 4 BYOK)", () => {
  it("maps UI key types to ProviderConnection providers", () => {
    expect(uiAiKeyTypeToProvider("anthropic")).toBe("ANTHROPIC");
    expect(uiAiKeyTypeToProvider("openai")).toBe("OPENAI");
    expect(uiAiKeyTypeToProvider("gemini")).toBe("GOOGLE");
  });

  it("maps BYOK providers to callAIProvider switch keys", () => {
    expect(aiProviderToCallProvider("ANTHROPIC")).toBe("anthropic");
    expect(aiProviderToCallProvider("OPENAI")).toBe("openai");
    expect(aiProviderToCallProvider("GOOGLE")).toBe("gemini");
    expect(aiProviderToCallProvider("OPENROUTER")).toBe("openrouter");
    expect(aiProviderToCallProvider("ELEVENLABS")).toBeNull();
  });
});
