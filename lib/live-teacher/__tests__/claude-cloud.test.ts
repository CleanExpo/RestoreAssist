// RA-1132g: Unit tests for invokeClaudeCloud
// Mocks @anthropic-ai/sdk; does not require a DB or API key.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma (fire-and-forget — must not fail tests)
// ---------------------------------------------------------------------------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveTeacherSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// vi.mock factories are hoisted before variable declarations, so we cannot
// reference a `const anthropicMock.create` from inside the factory.  Instead we
// expose the mock through a module-level object that IS accessible.
// ---------------------------------------------------------------------------

const anthropicMock = {
  create: vi.fn(),
};

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        // Indirect reference — safe because the object is initialised before
        // any test body runs (hoisting only affects the factory call site,
        // not module-level object creation).
        create: (...args: unknown[]) => anthropicMock.create(...args),
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Import SUT after mocks are in place
// ---------------------------------------------------------------------------
import {
  invokeClaudeCloud,
  type ClaudeCloudInput,
  type ClaudeCloudResult,
} from "../claude-cloud";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const baseInput: ClaudeCloudInput = {
  sessionId: "session-001",
  context: {
    inspectionId: "insp-001",
    userId: "user-001",
    jurisdiction: "AU",
    currentRoom: "Bathroom",
    stage: "moisture",
    missingFields: [],
  },
  history: [],
  userUtterance: "What moisture reading indicates Category 2 water damage?",
};

function makeSuccessResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50 },
    stop_reason: "end_turn",
  };
}

beforeEach(() => {
  anthropicMock.create.mockReset();
});

// ---------------------------------------------------------------------------
// Test 1: Successful call returns ClaudeCloudResult with parsed clauseRefs
// ---------------------------------------------------------------------------

describe("invokeClaudeCloud", () => {
  it("returns ClaudeCloudResult with clauseRefs parsed from response text", async () => {
    const responseText =
      "Category 2 water (Grey Water) has a moisture reading above 20% WME [S500:2025 §10.3.2]. " +
      "Always verify with a penetrating probe meter [S500:2025 §7.1].";

    anthropicMock.create.mockResolvedValueOnce(makeSuccessResponse(responseText));

    const result: ClaudeCloudResult = await invokeClaudeCloud(baseInput);

    expect(result.content).toBe(responseText);
    expect(result.clauseRefs).toContain("[S500:2025 §10.3.2]");
    expect(result.clauseRefs).toContain("[S500:2025 §7.1]");
    expect(result.clauseRefs).toHaveLength(2);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Test 2: API error returns structured fallback result
  // -------------------------------------------------------------------------

  it("returns structured fallback result when Anthropic API throws", async () => {
    anthropicMock.create.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await invokeClaudeCloud(baseInput);

    expect(result.content).toBe(
      "I'm having trouble connecting — please try again",
    );
    expect(result.clauseRefs).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.toolCalls).toEqual([]);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.costAudCents).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: Response with no clause references returns clauseRefs: []
  // -------------------------------------------------------------------------

  it("returns empty clauseRefs array when response contains no clause references", async () => {
    const responseText =
      "Make sure you measure in several spots across the affected area.";

    anthropicMock.create.mockResolvedValueOnce(makeSuccessResponse(responseText));

    const result = await invokeClaudeCloud(baseInput);

    expect(result.clauseRefs).toEqual([]);
    expect(result.content).toBe(responseText);
    // Should not throw — confidence just uses the hedge-less base
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: Cost calculation — given token counts, returns expected costAudCents
  // -------------------------------------------------------------------------

  it("computes costAudCents correctly from input/output token counts", async () => {
    // Pricing: $5.00 input / $25.00 output per million tokens
    // Rate: 155 AUD cents per USD (default)
    // inputTokens=1000, outputTokens=500
    // costUsd = 1000*(5/1_000_000) + 500*(25/1_000_000)
    //         = 0.005 + 0.0125 = 0.0175 USD
    // costAudCents = round(0.0175 * 155) = round(2.7125) = 3
    const expectedCostAudCents = Math.round(
      (1000 * (5 / 1_000_000) + 500 * (25 / 1_000_000)) * 155,
    );

    anthropicMock.create.mockResolvedValueOnce({
      content: [{ type: "text", text: "Test response" }],
      usage: { input_tokens: 1000, output_tokens: 500 },
      stop_reason: "end_turn",
    });

    const result = await invokeClaudeCloud(baseInput);

    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
    expect(result.costAudCents).toBe(expectedCostAudCents);
  });
});
