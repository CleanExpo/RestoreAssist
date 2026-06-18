import { describe, it, expect, vi } from "vitest";

// ai-provider imports prisma at module load; mock it so the pure key helper is
// testable without a generated Prisma client.
vi.mock("../prisma", () => ({ prisma: {} }));

import { selectAnthropicApiKey } from "../ai-provider";

describe("selectAnthropicApiKey (RA-6799 — platform ANTHROPIC_API_KEY fallback)", () => {
  it("uses a user-supplied (BYOK) Anthropic key when present", () => {
    expect(selectAnthropicApiKey("sk-ant-byok", "sk-ant-env")).toBe(
      "sk-ant-byok",
    );
  });

  it("REGRESSION: free/trial users fall back to the ANTHROPIC_API_KEY env var", () => {
    // The production bug: getAnthropicApiKey never read the env var, so free
    // users got a 400 even though the platform key should cover them.
    expect(selectAnthropicApiKey(null, "sk-ant-env")).toBe("sk-ant-env");
    expect(selectAnthropicApiKey(undefined, "sk-ant-env")).toBe("sk-ant-env");
  });

  it("trims the env key", () => {
    expect(selectAnthropicApiKey(null, "  sk-ant-env  ")).toBe("sk-ant-env");
  });

  it("throws when neither a user key nor the env var is set", () => {
    expect(() => selectAnthropicApiKey(null, null)).toThrow(
      /No Anthropic API key/,
    );
    expect(() => selectAnthropicApiKey(undefined, "")).toThrow(
      /No Anthropic API key/,
    );
  });

  it("refuses a non-Anthropic integration key (prefix is authoritative)", () => {
    expect(() => selectAnthropicApiKey("sk-openaikey", null)).toThrow(
      /non-Anthropic/,
    );
  });

  it("refuses a non-Anthropic env key", () => {
    expect(() => selectAnthropicApiKey(null, "sk-openaikey")).toThrow(
      /does not look like an Anthropic key/,
    );
  });
});
