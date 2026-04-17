/**
 * RA-1126: Unit tests for auto-classify — ruleBasedClassify regression +
 * llmClassify happy path + llmClassify fallback on malformed LLM response.
 *
 * The Anthropic client is mocked — no real API calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk BEFORE importing the module under test so the module
// picks up the mock at import time.
// ---------------------------------------------------------------------------
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));
  // Expose the inner mock so tests can configure return values
  (MockAnthropic as any).__mockCreate = mockCreate;
  return { default: MockAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import {
  ruleBasedClassify,
  llmClassify,
  type ClassificationResult,
} from "../auto-classify";

/** Helper: grab the messages.create mock from the constructor mock. */
function getCreateMock() {
  return (Anthropic as any).__mockCreate as ReturnType<typeof vi.fn>;
}

/** Build a minimal Anthropic messages.create response wrapping a text payload. */
function makeAnthropicResponse(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-opus-4-7",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

// ---------------------------------------------------------------------------
// Test 1: ruleBasedClassify regression — must still work on known inputs
// ---------------------------------------------------------------------------
describe("ruleBasedClassify", () => {
  it("detects fire/smoke and returns fire_smoke claimType", () => {
    const result = ruleBasedClassify({
      description: "Fire and smoke damage to kitchen",
    });
    expect(result.claimType).toBe("fire_smoke");
    expect(["high", "medium", "low"]).toContain(result.confidence);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("detects mould keywords and returns mould claimType", () => {
    const result = ruleBasedClassify({
      description: "Black mould found behind walls",
    });
    expect(result.claimType).toBe("mould");
  });

  it("detects storm keywords and returns storm claimType", () => {
    const result = ruleBasedClassify({
      description: "Hail and cyclone roof damage",
    });
    expect(result.claimType).toBe("storm");
  });

  it("defaults to water_damage when no keyword matches", () => {
    const result = ruleBasedClassify({ description: "Burst pipe in bathroom" });
    expect(result.claimType).toBe("water_damage");
  });

  it("assigns Category 3 for sewage contamination", () => {
    const result = ruleBasedClassify({
      description: "Sewage overflow flooded laundry",
    });
    expect(result.claimType).toBe("water_damage");
    expect(result.damageCategory).toBe(3);
  });

  it("assigns Class 4 when average moisture reading > 40", () => {
    const result = ruleBasedClassify({
      description: "Water damage",
      averageMoistureReading: 45,
    });
    expect(result.damageClass).toBe(4);
  });

  it("returns a result with the correct ClassificationResult shape", () => {
    const result: ClassificationResult = ruleBasedClassify({
      description: "Burst pipe leaked onto carpet",
      averageMoistureReading: 20,
    });
    expect(result).toHaveProperty("claimType");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
  });
});

// ---------------------------------------------------------------------------
// Test 2: llmClassify — happy path with mocked Anthropic client
// ---------------------------------------------------------------------------
describe("llmClassify — happy path", () => {
  beforeEach(() => {
    getCreateMock().mockReset();
  });

  it("returns a parsed ClassificationResult from a well-formed LLM response", async () => {
    const llmPayload = {
      claimType: "water",
      category: 2,
      class: 3,
      confidence: 0.92,
      reasoning:
        "Grey water ingress from dishwasher overflow per S500:2025 §10.5.2 and §10.6.3.",
      clauseRefs: ["S500:2025 §10.5.2", "S500:2025 §10.6.3"],
      humanReviewRequired: false,
    };

    getCreateMock().mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(llmPayload)),
    );

    const result = await llmClassify({
      description: "Dishwasher overflow flooded kitchen floor",
      averageMoistureReading: 28,
      jurisdiction: "AU",
    });

    expect(result.claimType).toBe("water_damage");
    expect(result.damageCategory).toBe(2);
    expect(result.damageClass).toBe(3);
    expect(result.confidence).toBe("high"); // 0.92 → high
    expect(result.llmConfidence).toBeCloseTo(0.92);
    expect(result.clauseRefs).toEqual([
      "S500:2025 §10.5.2",
      "S500:2025 §10.6.3",
    ]);
    expect(result.humanReviewRequired).toBe(false);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThanOrEqual(20);
  });

  it("sets humanReviewRequired=true when confidence < 0.7", async () => {
    const llmPayload = {
      claimType: "storm",
      category: 1,
      class: 2,
      confidence: 0.55,
      reasoning:
        "Ambiguous storm and water damage; roof damaged by wind per S500:2025 §10.5.1.",
      clauseRefs: ["S500:2025 §10.5.1"],
      humanReviewRequired: false, // LLM says false, but confidence < 0.7 should override
    };

    getCreateMock().mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(llmPayload)),
    );

    const result = await llmClassify({
      description: "Wind damage blew off roof tiles",
    });

    expect(result.claimType).toBe("storm");
    expect(result.confidence).toBe("low"); // 0.55 → low
    expect(result.humanReviewRequired).toBe(true); // overridden because confidence < 0.7
  });

  it("strips markdown fences if the model wraps JSON in a code block", async () => {
    const llmPayload = {
      claimType: "mould",
      category: 1,
      class: 1,
      confidence: 0.88,
      reasoning:
        "Mould contamination consistent with S500:2025 §10.5 category 1 assessment.",
      clauseRefs: ["S500:2025 §10.5"],
      humanReviewRequired: false,
    };

    getCreateMock().mockResolvedValueOnce(
      makeAnthropicResponse("```json\n" + JSON.stringify(llmPayload) + "\n```"),
    );

    const result = await llmClassify({
      description: "Black mould behind bathroom tiles",
    });

    expect(result.claimType).toBe("mould");
    expect(result.llmConfidence).toBeCloseTo(0.88);
  });
});

// ---------------------------------------------------------------------------
// Test 3: llmClassify — fallback on malformed LLM response
// ---------------------------------------------------------------------------
describe("llmClassify — fallback to ruleBasedClassify", () => {
  beforeEach(() => {
    getCreateMock().mockReset();
  });

  it("falls back when LLM returns invalid JSON", async () => {
    getCreateMock().mockResolvedValueOnce(
      makeAnthropicResponse("Sorry, I cannot classify this at the moment."),
    );

    // ruleBasedClassify would detect "fire" here
    const result = await llmClassify({
      description: "Fire and smoke damaged living room",
    });

    // Should fall back to rule-based result — no llmConfidence set
    expect(result.llmConfidence).toBeUndefined();
    expect(result.claimType).toBe("fire_smoke");
  });

  it("falls back when LLM returns JSON that fails Zod validation", async () => {
    const badPayload = {
      claimType: "water",
      // category is missing — required by schema
      class: 5, // out of range [1-4]
      confidence: 1.5, // out of range [0-1]
      reasoning: "short", // too short (< 20 chars)
      clauseRefs: "not an array", // wrong type
      humanReviewRequired: "yes", // wrong type
    };

    getCreateMock().mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify(badPayload)),
    );

    const result = await llmClassify({
      description: "Burst pipe, water everywhere in bathroom",
    });

    expect(result.llmConfidence).toBeUndefined();
    expect(result.claimType).toBe("water_damage"); // rule-based fallback
  });

  it("falls back when the Anthropic API call throws", async () => {
    getCreateMock().mockRejectedValueOnce(new Error("API error: rate limited"));

    const result = await llmClassify({
      description: "Mould discovered in roof cavity",
    });

    expect(result.llmConfidence).toBeUndefined();
    expect(result.claimType).toBe("mould"); // rule-based fallback detects mould keyword
  });

  it("falls back when the response has no text block", async () => {
    getCreateMock().mockResolvedValueOnce({
      ...makeAnthropicResponse(""),
      content: [{ type: "thinking", thinking: "hmm..." }], // no text block
    });

    const result = await llmClassify({
      description: "Sewage backup flooded laundry",
    });

    expect(result.llmConfidence).toBeUndefined();
    expect(result.claimType).toBe("water_damage");
    expect(result.damageCategory).toBe(3); // sewage → cat 3 from rule-based
  });
});
