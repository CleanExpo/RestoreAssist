/**
 * Opus 4.7+ and Sonnet 5+ reject temperature / top_p / top_k with a 400.
 * The BYOK Anthropic path must omit them for those models and keep sending
 * temperature for older models.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { byokDispatch, type AllowedModel } from "../byok-client";

function lastRequest(): Record<string, unknown> {
  expect(create).toHaveBeenCalledTimes(1);
  return create.mock.calls[0][0] as Record<string, unknown>;
}

describe("byokDispatch Anthropic sampling params", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  });

  it.each<AllowedModel>(["claude-sonnet-5", "claude-opus-4-8"])(
    "%s sends no sampling params when the caller sets none",
    async (model) => {
      await byokDispatch({
        model,
        apiKey: "test-key",
        systemPrompt: "system",
        userPrompt: "prompt",
      });
      const req = lastRequest();
      expect(req.model).toBe(model);
      expect(req).not.toHaveProperty("temperature");
      expect(req).not.toHaveProperty("top_p");
      expect(req).not.toHaveProperty("top_k");
    },
  );

  it.each<AllowedModel>(["claude-sonnet-5", "claude-opus-4-8"])(
    "%s drops an explicit caller temperature",
    async (model) => {
      await byokDispatch({
        model,
        apiKey: "test-key",
        systemPrompt: "system",
        userPrompt: "prompt",
        temperature: 0.2,
      });
      const req = lastRequest();
      expect(req).not.toHaveProperty("temperature");
      expect(req).not.toHaveProperty("top_p");
      expect(req).not.toHaveProperty("top_k");
    },
  );

  it("claude-sonnet-4-6 still sends the default temperature 0.3", async () => {
    await byokDispatch({
      model: "claude-sonnet-4-6",
      apiKey: "test-key",
      systemPrompt: "system",
      userPrompt: "prompt",
    });
    expect(lastRequest().temperature).toBe(0.3);
  });

  it("claude-sonnet-4-6 still sends an explicit caller temperature", async () => {
    await byokDispatch({
      model: "claude-sonnet-4-6",
      apiKey: "test-key",
      systemPrompt: "system",
      userPrompt: "prompt",
      temperature: 0.2,
    });
    expect(lastRequest().temperature).toBe(0.2);
  });
});
