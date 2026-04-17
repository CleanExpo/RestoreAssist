import { describe, expect, it } from "vitest";
import { routeTurn, type RoutingInput } from "../router";
import type { TeacherTurn } from "../types";

function turn(content: string): TeacherTurn {
  return { role: "user", content };
}

const baseInput: Omit<RoutingInput, "utterance"> = {
  online: true,
  containsPII: false,
  requiresClauseCitation: false,
};

describe("routeTurn", () => {
  it("routes offline turns to Gemma local and bypasses cloud", () => {
    const decision = routeTurn({
      ...baseInput,
      online: false,
      utterance: turn(
        "This is a long utterance that would otherwise go to the cloud if we were online right now",
      ),
    });

    expect(decision.target).toBe("gemma_local");
    expect(decision.bypassCloud).toBe(true);
    expect(decision.reason).toBe("offline");
  });

  it("routes PII-bearing turns to Gemma local and bypasses cloud", () => {
    const decision = routeTurn({
      ...baseInput,
      containsPII: true,
      requiresClauseCitation: true, // should still bypass despite citation need
      utterance: turn(
        "Customer John Smith at 12 Example Street has a category 3 blackwater event in the main bathroom",
      ),
    });

    expect(decision.target).toBe("gemma_local");
    expect(decision.bypassCloud).toBe(true);
    expect(decision.reason).toBe("PII redaction required");
  });

  it("routes short utterances (<15 words) to Gemma local without bypassing cloud", () => {
    const decision = routeTurn({
      ...baseInput,
      requiresClauseCitation: true, // short-circuits before citation rule
      utterance: turn("what category is this"), // 4 words
    });

    expect(decision.target).toBe("gemma_local");
    expect(decision.bypassCloud).toBe(false);
    expect(decision.reason).toBe("short utterance (<15 words)");
  });

  it("routes long clause-citation turns to Claude cloud", () => {
    const decision = routeTurn({
      ...baseInput,
      requiresClauseCitation: true,
      utterance: turn(
        "Please classify this water damage event and cite the exact IICRC S500 clause that supports your reasoning",
      ),
    });

    expect(decision.target).toBe("claude_cloud");
    expect(decision.bypassCloud).toBe(false);
    expect(decision.reason).toBe("clause citation required");
  });

  it("routes long non-citation turns to Gemma local as the default cheap path", () => {
    const decision = routeTurn({
      ...baseInput,
      utterance: turn(
        "I am walking through the kitchen now and looking at the cabinets along the back wall to assess them",
      ),
    });

    expect(decision.target).toBe("gemma_local");
    expect(decision.bypassCloud).toBe(false);
    expect(decision.reason).toBe("default cheap path");
  });
});
