/**
 * RA-6998 — Margot reasons on a FREE OpenRouter model. These tests pin the
 * zero-platform-cost invariant: the default is a :free variant, MARGOT_MODEL can
 * override it but ONLY with another :free variant, and the model is built
 * against the platform OpenRouter key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MARGOT_MODEL,
  createMargotModel,
  getOpenRouterApiKey,
  isFreeModel,
  resolveMargotModelId,
} from "../openrouter";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("resolveMargotModelId", () => {
  it("defaults to a :free variant when MARGOT_MODEL is unset", () => {
    delete process.env.MARGOT_MODEL;
    expect(resolveMargotModelId()).toBe(DEFAULT_MARGOT_MODEL);
    expect(isFreeModel(DEFAULT_MARGOT_MODEL)).toBe(true);
  });

  it("honours a :free MARGOT_MODEL override", () => {
    process.env.MARGOT_MODEL = "google/gemma-4-31b-it:free";
    expect(resolveMargotModelId()).toBe("google/gemma-4-31b-it:free");
  });

  it("REJECTS a non-:free MARGOT_MODEL and falls back to the free default (zero-cost guard)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MARGOT_MODEL = "anthropic/claude-opus-4.1"; // paid — must be ignored
    expect(resolveMargotModelId()).toBe(DEFAULT_MARGOT_MODEL);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("trims whitespace around the configured id", () => {
    process.env.MARGOT_MODEL = "  deepseek/deepseek-chat-v3.1:free  ";
    expect(resolveMargotModelId()).toBe("deepseek/deepseek-chat-v3.1:free");
  });
});

describe("getOpenRouterApiKey", () => {
  it("returns null when the platform key is unset (fail-closed)", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(getOpenRouterApiKey()).toBeNull();
  });

  it("returns the trimmed platform key when set", () => {
    process.env.OPENROUTER_API_KEY = "  sk-or-platform  ";
    expect(getOpenRouterApiKey()).toBe("sk-or-platform");
  });
});

describe("createMargotModel", () => {
  it("throws when the platform key is unset", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => createMargotModel()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("builds an OpenRouter chat model on the resolved :free id", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-platform";
    delete process.env.MARGOT_MODEL;
    const model = createMargotModel();
    expect(model.modelId).toBe(DEFAULT_MARGOT_MODEL);
    // Provider is the OpenRouter-named OpenAI-compatible chat endpoint.
    expect(model.provider).toContain("openrouter");
  });
});
