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

// RA-1132f — mock the tool layer. Provide the take_reading definition so the
// Phase-1 allowlist has something to enable, and a spy for dispatchTool.
const dispatchToolMock = vi.fn();
vi.mock("../tools", () => ({
  TOOL_DEFINITIONS: [
    {
      name: "take_reading",
      description: "Log a moisture reading",
      input_schema: { type: "object", properties: {}, required: [] },
    },
  ],
  dispatchTool: (...args: unknown[]) => dispatchToolMock(...args),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        messages: {
          // Indirect reference — safe because the object is initialised before
          // any test body runs (hoisting only affects the factory call site,
          // not module-level object creation).
          create: (...args: unknown[]) => anthropicMock.create(...args),
        },
      };
    }),
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
import { prisma } from "@/lib/prisma";

const updateManyMock = vi.mocked(prisma.liveTeacherSession.updateMany);

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const baseInput: ClaudeCloudInput = {
  sessionId: "session-001",
  // RA-6963 (BYOK) — per-call workspace key; the mocked SDK ignores it.
  apiKey: "sk-ant-test",
  context: {
    inspectionId: "insp-001",
    userId: "user-001",
    jurisdiction: "AU",
    currentRoom: "Bathroom",
    stage: "moisture",
    missingFields: [],
    wetReadings: [],
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
  dispatchToolMock.mockReset();
});

function toolUseResponse(name: string, input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    usage: { input_tokens: 80, output_tokens: 30 },
    stop_reason: "tool_use",
  };
}

// A single response carrying several tool_use blocks (distinct ids). Models can
// emit the same write twice in one turn on self-correction/retry.
function multiToolUseResponse(
  blocks: Array<{ id: string; name: string; input: Record<string, unknown> }>,
) {
  return {
    content: blocks.map((b) => ({ type: "tool_use", ...b })),
    usage: { input_tokens: 80, output_tokens: 30 },
    stop_reason: "tool_use",
  };
}

describe("invokeClaudeCloud — tool layer (RA-1132f)", () => {
  it("runs take_reading with the injected real inspectionId and returns the result", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        toolUseResponse("take_reading", {
          inspectionId: "SPOOFED-OTHER-TENANT",
          location: "Bathroom",
          surfaceType: "drywall",
          moistureLevel: 45,
          unit: "PERCENT_MC",
        }),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("Logged 45% MC in the bathroom [S500:2021 §10.5]."),
      );
    dispatchToolMock.mockResolvedValueOnce({
      id: "mr_1",
      location: "Bathroom",
      value: 45,
      unit: "PERCENT_MC",
    });

    const result = await invokeClaudeCloud(baseInput);

    // dispatchTool called once, with the SESSION inspectionId (not the spoofed
    // one) and the authenticated userId context.
    expect(dispatchToolMock).toHaveBeenCalledTimes(1);
    const [name, args, ctx] = dispatchToolMock.mock.calls[0];
    expect(name).toBe("take_reading");
    expect((args as { inspectionId?: string }).inspectionId).toBe("insp-001");
    expect(ctx).toEqual({ userId: "user-001" });

    // Final content is the post-tool summary; tool call + result captured.
    expect(result.content).toContain("Logged 45% MC");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: "take_reading",
      error: undefined,
      result: { id: "mr_1", value: 45 },
    });
    // Tokens accumulate across both iterations (80+100 in, 30+50 out).
    expect(result.inputTokens).toBe(180);
    expect(result.outputTokens).toBe(80);
  });

  it("records a tool error and still returns a grounded answer", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        toolUseResponse("take_reading", { location: "Kitchen" }),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("I couldn't log that reading — please retry."),
      );
    dispatchToolMock.mockRejectedValueOnce(
      new Error('tenancy check failed (403): not owner'),
    );

    const result = await invokeClaudeCloud(baseInput);

    expect(result.toolCalls[0].error).toContain("tenancy check failed");
    expect(result.content).toContain("couldn't log that");
  });

  it("refuses a tool outside the phase allowlist without dispatching", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(toolUseResponse("capture_photo", {}))
      .mockResolvedValueOnce(makeSuccessResponse("Noted."));

    const result = await invokeClaudeCloud(baseInput);

    expect(dispatchToolMock).not.toHaveBeenCalled();
    expect(result.toolCalls[0].error).toMatch(/not enabled/i);
  });

  it("runs fill_scope_item (auto-write) with the injected id (RA-1132f-4)", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        toolUseResponse("fill_scope_item", {
          inspectionId: "SPOOFED",
          itemType: "remove_carpet",
          description: "Remove carpet in bedroom",
        }),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("Added remove-carpet to the scope [S500:2021 §12.2]."),
      );
    dispatchToolMock.mockResolvedValueOnce({
      id: "si_1",
      itemType: "remove_carpet",
      description: "Remove carpet in bedroom",
    });

    const result = await invokeClaudeCloud(baseInput);

    const [name, args] = dispatchToolMock.mock.calls[0];
    expect(name).toBe("fill_scope_item");
    expect((args as { inspectionId?: string }).inspectionId).toBe("insp-001");
    expect(result.toolCalls[0].result).toMatchObject({ id: "si_1" });
  });

  it("proposes flag_whs_hazard without executing it (confirm-required, RA-1132f-3)", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        toolUseResponse("flag_whs_hazard", {
          hazardType: "asbestos",
          severity: "HIGH",
        }),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("I've flagged an asbestos hazard for your confirmation."),
      );

    const result = await invokeClaudeCloud(baseInput);

    // NOT executed — no compliance write happens during the turn.
    expect(dispatchToolMock).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({
      name: "flag_whs_hazard",
      proposed: true,
    });
    expect(result.toolCalls[0].result).toBeUndefined();
    expect(result.content).toContain("flagged an asbestos hazard");
  });

  it("de-duplicates identical take_reading blocks in one turn (write runs once)", async () => {
    const identicalArgs = {
      location: "Bathroom",
      surfaceType: "drywall",
      moistureLevel: 45,
      unit: "PERCENT_MC",
    };
    anthropicMock.create
      .mockResolvedValueOnce(
        multiToolUseResponse([
          { id: "tu_a", name: "take_reading", input: { ...identicalArgs } },
          { id: "tu_b", name: "take_reading", input: { ...identicalArgs } },
        ]),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("Logged 45% MC in the bathroom [S500:2021 §10.5]."),
      );
    dispatchToolMock.mockResolvedValue({ id: "mr_1", value: 45 });

    const result = await invokeClaudeCloud(baseInput);

    // Only ONE write, despite two identical tool_use blocks in the turn.
    expect(dispatchToolMock).toHaveBeenCalledTimes(1);
    expect(
      result.toolCalls.filter((c) => c.name === "take_reading"),
    ).toHaveLength(1);
    expect(result.content).toContain("Logged 45% MC");
  });

  it("runs two DIFFERENT take_reading blocks independently (both write)", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        multiToolUseResponse([
          {
            id: "tu_a",
            name: "take_reading",
            input: { location: "Bathroom", moistureLevel: 45 },
          },
          {
            id: "tu_b",
            name: "take_reading",
            input: { location: "Bathroom", moistureLevel: 60 },
          },
        ]),
      )
      .mockResolvedValueOnce(makeSuccessResponse("Logged both [S500:2021 §10.5]."));
    dispatchToolMock.mockResolvedValue({ id: "mr_x" });

    const result = await invokeClaudeCloud(baseInput);

    // Two genuine readings (different moistureLevel) both run.
    expect(dispatchToolMock).toHaveBeenCalledTimes(2);
    expect(
      result.toolCalls.filter((c) => c.name === "take_reading"),
    ).toHaveLength(2);
  });

  it("runs check_report_gaps (read-only) with the injected id and returns gaps", async () => {
    anthropicMock.create
      .mockResolvedValueOnce(
        toolUseResponse("check_report_gaps", { inspectionId: "SPOOFED" }),
      )
      .mockResolvedValueOnce(
        makeSuccessResponse("You still need photos [S500:2021 §9]."),
      );
    dispatchToolMock.mockResolvedValueOnce({
      gaps: [{ field: "photos", severity: "warn", description: "No photos" }],
    });

    const result = await invokeClaudeCloud(baseInput);

    const [name, args] = dispatchToolMock.mock.calls[0];
    expect(name).toBe("check_report_gaps");
    expect((args as { inspectionId?: string }).inspectionId).toBe("insp-001");
    expect(result.toolCalls[0].result).toEqual({
      gaps: [{ field: "photos", severity: "warn", description: "No photos" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Test 1: Successful call returns ClaudeCloudResult with parsed clauseRefs
// ---------------------------------------------------------------------------

describe("invokeClaudeCloud", () => {
  it("returns ClaudeCloudResult with clauseRefs parsed from response text", async () => {
    const responseText =
      "Category 2 water (Grey Water) has a moisture reading above 20% WME [S500:2021 §10.3.2]. " +
      "Always verify with a penetrating probe meter [S500:2021 §7.1].";

    anthropicMock.create.mockResolvedValueOnce(
      makeSuccessResponse(responseText),
    );

    const result: ClaudeCloudResult = await invokeClaudeCloud(baseInput);

    expect(result.content).toBe(responseText);
    expect(result.clauseRefs).toContain("[S500:2021 §10.3.2]");
    expect(result.clauseRefs).toContain("[S500:2021 §7.1]");
    expect(result.clauseRefs).toHaveLength(2);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("extracts a clauseRef when the model writes the IICRC-prefixed form", async () => {
    const responseText =
      "Category 2 water (Grey Water) has a moisture reading above 20% WME " +
      "[IICRC S500:2021 §10.5].";

    anthropicMock.create.mockResolvedValueOnce(
      makeSuccessResponse(responseText),
    );

    const result: ClaudeCloudResult = await invokeClaudeCloud(baseInput);

    expect(result.clauseRefs).toContain("[IICRC S500:2021 §10.5]");
    expect(result.clauseRefs).toHaveLength(1);
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

    anthropicMock.create.mockResolvedValueOnce(
      makeSuccessResponse(responseText),
    );

    const result = await invokeClaudeCloud(baseInput);

    expect(result.clauseRefs).toEqual([]);
    expect(result.content).toBe(responseText);
    // Should not throw — confidence just uses the hedge-less base
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // RA-7052: the per-turn cost write is AWAITED before the return, not
  // deferred via setImmediate. A serverless freeze after the return would
  // drop a deferred write and silently lose per-turn cost.
  // -------------------------------------------------------------------------

  it("writes the session cost tally in-window (before invokeClaudeCloud resolves)", async () => {
    updateManyMock.mockClear();
    anthropicMock.create.mockResolvedValueOnce(
      makeSuccessResponse("Category 2 grey water. [S500:2021 §10.3.2]"),
    );

    const result = await invokeClaudeCloud(baseInput);

    // The write has already happened by the time the awaited call resolves —
    // proving it is not deferred to a later macrotask (setImmediate/next tick).
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "session-001" },
      data: {
        modelUsedCloud: "claude-opus-4-7",
        totalInputTokens: { increment: 100 },
        totalOutputTokens: { increment: 50 },
        totalCostAudCents: { increment: result.costAudCents },
      },
    });
  });

  it("does not throw or lose the utterance when the cost write fails", async () => {
    updateManyMock.mockRejectedValueOnce(new Error("db unavailable"));
    anthropicMock.create.mockResolvedValueOnce(
      makeSuccessResponse("Use a penetrating probe meter. [S500:2021 §7.1]"),
    );

    const result = await invokeClaudeCloud(baseInput);

    // Turn still resolves with the assistant content — cost-write failure is
    // logged and swallowed, never rethrown.
    expect(result.content).toContain("penetrating probe meter");
    expect(result.clauseRefs).toContain("[S500:2021 §7.1]");
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

  // -------------------------------------------------------------------------
  // Test 5: proactive coaching — missingFields reach the model and the system
  // prompt instructs the coach to act on them (the deskilling loop).
  // -------------------------------------------------------------------------

  it("injects missingFields context and instructs proactive coaching", async () => {
    anthropicMock.create.mockResolvedValueOnce(makeSuccessResponse("Noted."));

    await invokeClaudeCloud({
      ...baseInput,
      context: {
        ...baseInput.context,
        currentRoom: "Bathroom",
        stage: "walkthrough",
        missingFields: ["water category (S500 §10.5)", "moisture readings"],
        wetReadings: ["Bathroom: plasterboard at 22% is above the 1% dry standard"],
      },
    });

    const callArg = anthropicMock.create.mock.calls[0][0] as {
      system: string;
      messages: Array<{ content: string }>;
    };

    // System prompt tells the coach to act on outstanding items + wet materials.
    expect(callArg.system).toMatch(/Coach proactively/);
    expect(callArg.system).toContain("missingFields");
    expect(callArg.system).toContain("stillWet");

    // The outstanding items + stage + still-wet materials reach the model.
    const firstMessage = callArg.messages[0].content;
    expect(firstMessage).toContain(
      "missingFields=water category (S500 §10.5), moisture readings",
    );
    expect(firstMessage).toContain("stage=walkthrough");
    expect(firstMessage).toContain("room=Bathroom");
    expect(firstMessage).toContain(
      "stillWet=Bathroom: plasterboard at 22% is above the 1% dry standard",
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: the context block must reach the model on EVERY turn, not just the
  // first. The turn route loads prior turns into `history`, so from turn 2 on
  // `messages` is non-empty; if the block only rode the first user message the
  // coach would go blind to new readings/rooms/filled fields (regression guard).
  // -------------------------------------------------------------------------

  it("prepends the fresh context block to the current utterance when history is non-empty", async () => {
    anthropicMock.create.mockResolvedValueOnce(makeSuccessResponse("Noted."));

    await invokeClaudeCloud({
      ...baseInput,
      context: {
        ...baseInput.context,
        currentRoom: "Kitchen",
        stage: "classification",
        missingFields: ["water category (S500 §10.5)"],
        wetReadings: ["Kitchen: subfloor at 18% above dry standard"],
      },
      history: [
        { role: "user", content: "We just moved into the kitchen." },
        { role: "assistant", content: "Noted the kitchen [S500:2021 §10.5]." },
      ],
    });

    const callArg = anthropicMock.create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };

    // History turns precede the current one and stay raw (no retro-prepend).
    expect(callArg.messages).toHaveLength(3);
    expect(callArg.messages[0].content).toBe("We just moved into the kitchen.");
    expect(callArg.messages[0].content).not.toContain("[Context:");
    expect(callArg.messages[1].content).not.toContain("[Context:");

    // The CURRENT (last) user message carries the freshly-built context block.
    const currentMessage = callArg.messages[2];
    expect(currentMessage.role).toBe("user");
    expect(currentMessage.content).toContain("room=Kitchen");
    expect(currentMessage.content).toContain("stage=classification");
    expect(currentMessage.content).toContain(
      "missingFields=water category (S500 §10.5)",
    );
    expect(currentMessage.content).toContain(
      "stillWet=Kitchen: subfloor at 18% above dry standard",
    );
    expect(currentMessage.content).toContain(baseInput.userUtterance);
  });

  // -------------------------------------------------------------------------
  // Test 7: turn 1 (empty history) still carries the context block on the sole
  // user message — the fix must not regress the first-turn behaviour.
  // -------------------------------------------------------------------------

  it("still prepends the context block on turn 1 (empty history)", async () => {
    anthropicMock.create.mockResolvedValueOnce(makeSuccessResponse("Noted."));

    await invokeClaudeCloud({
      ...baseInput,
      context: { ...baseInput.context, currentRoom: "Laundry" },
      history: [],
    });

    const callArg = anthropicMock.create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(callArg.messages).toHaveLength(1);
    expect(callArg.messages[0].content).toContain("room=Laundry");
    expect(callArg.messages[0].content).toContain(baseInput.userUtterance);
  });
});
