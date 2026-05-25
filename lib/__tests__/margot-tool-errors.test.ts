import { describe, expect, it } from "vitest";
import { formatDeepResearchFailure } from "../margot-tool-errors";

describe("formatDeepResearchFailure", () => {
  it("does not expose provider exception details", () => {
    const result = formatDeepResearchFailure(
      new Error("Gemini failed with key sk-secret and stack trace"),
    );

    expect(result).toEqual({
      error: "deep_research failed",
      retryable: false,
    });
  });

  it("preserves retryability without returning raw error text", () => {
    const result = formatDeepResearchFailure(
      new Error("upstream unavailable after ECONNRESET"),
    );

    expect(result).toEqual({
      error: "deep_research failed",
      retryable: true,
    });
  });
});
