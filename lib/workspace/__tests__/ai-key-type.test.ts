import { describe, expect, it } from "vitest";
import {
  aiProviderToCallProvider,
  isUiAiKeyType,
  mismatchedKeyType,
  uiAiKeyTypeForKey,
  uiAiKeyTypeToProvider,
  UI_AI_KEY_TYPES,
  type UiAiKeyType,
} from "@/lib/workspace/ai-key-type";
import { providerForKey } from "@/lib/ai-provider";

/**
 * Pinned LITERALLY, not derived from UI_AI_KEY_TYPES. The loops below iterate
 * this list; deriving it from the export under test would make every one of
 * them tautological — dropping a provider would simply mean fewer iterations
 * and a still-green suite, while the Integrations page silently stopped
 * offering it. (Proven: a mutant that removed "openrouter" survived until this
 * changed.)
 */
const ALL_UI_KEY_TYPES: readonly UiAiKeyType[] = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
];

describe("ai-key-type mapping (Wave 4 BYOK)", () => {
  it("maps UI key types to ProviderConnection providers", () => {
    expect(uiAiKeyTypeToProvider("anthropic")).toBe("ANTHROPIC");
    expect(uiAiKeyTypeToProvider("openai")).toBe("OPENAI");
    expect(uiAiKeyTypeToProvider("gemini")).toBe("GOOGLE");
    expect(uiAiKeyTypeToProvider("openrouter")).toBe("OPENROUTER");
  });

  it("round-trips every UI key type back to a callAIProvider key", () => {
    // A provider the Integrations page can offer but the dispatch path cannot
    // route is a dead option — the key saves and then fails at report time.
    for (const keyType of ALL_UI_KEY_TYPES) {
      expect(aiProviderToCallProvider(uiAiKeyTypeToProvider(keyType))).toBe(
        keyType,
      );
    }
  });

  it("maps BYOK providers to callAIProvider switch keys", () => {
    expect(aiProviderToCallProvider("ANTHROPIC")).toBe("anthropic");
    expect(aiProviderToCallProvider("OPENAI")).toBe("openai");
    expect(aiProviderToCallProvider("GOOGLE")).toBe("gemini");
    expect(aiProviderToCallProvider("OPENROUTER")).toBe("openrouter");
    expect(aiProviderToCallProvider("ELEVENLABS")).toBeNull();
  });
});

describe("uiAiKeyTypeForKey — the one prefix table", () => {
  it("resolves each vendor from its key prefix", () => {
    expect(uiAiKeyTypeForKey("sk-ant-api03-abcdefghijklmnop")).toBe(
      "anthropic",
    );
    expect(uiAiKeyTypeForKey("sk-or-v1-abcdefghijklmnop")).toBe("openrouter");
    expect(uiAiKeyTypeForKey("AIzaSyAbcdefghijklmnopqrst")).toBe("gemini");
    expect(uiAiKeyTypeForKey("sk-proj-abcdefghijklmnop")).toBe("openai");
    expect(uiAiKeyTypeForKey("sk-abcdefghijklmnopqrst")).toBe("openai");
  });

  it("checks the OpenRouter prefix BEFORE the generic OpenAI one", () => {
    // Both begin `sk-`. If the order flips, every OpenRouter key is read as
    // OpenAI and gets dispatched to the wrong vendor.
    expect(uiAiKeyTypeForKey("sk-or-v1-0000000000000000")).not.toBe("openai");
  });

  it("returns null for an unrecognised or absent key", () => {
    expect(uiAiKeyTypeForKey(null)).toBeNull();
    expect(uiAiKeyTypeForKey(undefined)).toBeNull();
    expect(uiAiKeyTypeForKey("")).toBeNull();
    expect(uiAiKeyTypeForKey("   ")).toBeNull();
    expect(uiAiKeyTypeForKey("not-a-key")).toBeNull();
  });

  it("ignores surrounding whitespace from a paste", () => {
    expect(uiAiKeyTypeForKey("  sk-or-v1-abcdefghijklmnop\n")).toBe(
      "openrouter",
    );
  });

  it("is the same table lib/ai-provider.ts routes on", () => {
    // providerForKey decides which vendor a stored key is actually sent to.
    // Two independent prefix tables would be free to drift; this proves there
    // is only one. AIProvider and UiAiKeyType share their string values.
    for (const key of [
      "sk-ant-api03-abcdefghijklmnop",
      "sk-or-v1-abcdefghijklmnop",
      "AIzaSyAbcdefghijklmnopqrst",
      "sk-proj-abcdefghijklmnop",
      "not-a-key",
      "",
    ]) {
      expect(providerForKey(key)).toBe(uiAiKeyTypeForKey(key));
    }
  });
});

describe("mismatchedKeyType — refuse a key saved under the wrong provider", () => {
  it("names the implied vendor when the prefix contradicts the pick", () => {
    // The failure this prevents: an OpenRouter key stored as ANTHROPIC saves
    // cleanly and only fails later, as an opaque upstream auth error during
    // report generation, because dispatch routes on the stored enum.
    expect(mismatchedKeyType("anthropic", "sk-or-v1-abcdefghijklmnop")).toBe(
      "openrouter",
    );
    expect(mismatchedKeyType("openrouter", "sk-ant-api03-abcdefgh")).toBe(
      "anthropic",
    );
    expect(mismatchedKeyType("gemini", "sk-proj-abcdefghijklmnop")).toBe(
      "openai",
    );
    expect(mismatchedKeyType("openai", "AIzaSyAbcdefghijklmnop")).toBe(
      "gemini",
    );
  });

  it("passes every key that agrees with its selected provider", () => {
    const agreeing: Record<UiAiKeyType, string> = {
      anthropic: "sk-ant-api03-abcdefghijklmnop",
      openai: "sk-proj-abcdefghijklmnop",
      gemini: "AIzaSyAbcdefghijklmnopqrst",
      openrouter: "sk-or-v1-abcdefghijklmnop",
    };
    for (const keyType of ALL_UI_KEY_TYPES) {
      expect(mismatchedKeyType(keyType, agreeing[keyType])).toBeNull();
    }
  });

  it("never blocks a prefix the table has not seen", () => {
    // A proxy key, a gateway key, a future prefix — refusing those would break
    // a working setup on a guess. Only a confident disagreement refuses.
    for (const keyType of ALL_UI_KEY_TYPES) {
      expect(mismatchedKeyType(keyType, "gsk_abcdefghijklmnopqrst")).toBeNull();
      expect(mismatchedKeyType(keyType, "")).toBeNull();
      expect(mismatchedKeyType(keyType, null)).toBeNull();
    }
  });

  it("does not treat an sk-ant- key as merely OpenAI-shaped", () => {
    // `sk-ant-…` also starts with `sk-`; a naive table would call it openai and
    // this guard would then fire on a correct Anthropic pick.
    expect(mismatchedKeyType("anthropic", "sk-ant-api03-abcdefgh")).toBeNull();
  });
});

describe("UI_AI_KEY_TYPES — the offered provider list", () => {
  it("offers exactly the four BYOK providers, in picker order", () => {
    // This array IS the Integrations page's dropdown. An entry silently
    // dropped here removes a provider from the product.
    expect([...UI_AI_KEY_TYPES]).toEqual([
      "anthropic",
      "openai",
      "gemini",
      "openrouter",
    ]);
  });

  it("offers every provider the dispatch path can actually route", () => {
    for (const keyType of ALL_UI_KEY_TYPES) {
      expect(UI_AI_KEY_TYPES).toContain(keyType);
    }
  });
});

describe("isUiAiKeyType — narrowing an untrusted stored value", () => {
  it("accepts every offered key type", () => {
    for (const keyType of ALL_UI_KEY_TYPES) {
      expect(isUiAiKeyType(keyType)).toBe(true);
    }
  });

  it("rejects inherited Object property names", () => {
    // The reason this is a list test and not `value in SOME_RECORD`: `in` walks
    // the prototype chain, so a persisted config of {apiKeyType: "toString"}
    // would pass, and the caller would then index its copy table with it and
    // render "Enter your undefined API key".
    expect(isUiAiKeyType("toString")).toBe(false);
    expect(isUiAiKeyType("constructor")).toBe(false);
    expect(isUiAiKeyType("__proto__")).toBe(false);
    expect(isUiAiKeyType("hasOwnProperty")).toBe(false);
  });

  it("rejects non-strings and unknown providers", () => {
    expect(isUiAiKeyType(undefined)).toBe(false);
    expect(isUiAiKeyType(null)).toBe(false);
    expect(isUiAiKeyType(42)).toBe(false);
    expect(isUiAiKeyType("")).toBe(false);
    expect(isUiAiKeyType("mistral")).toBe(false);
    expect(isUiAiKeyType("ANTHROPIC")).toBe(false);
  });
});
