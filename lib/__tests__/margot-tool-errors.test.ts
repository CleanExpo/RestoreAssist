import { describe, expect, it } from "vitest";
import {
  formatDeepResearchFailure,
  formatImageGenerateFailure,
} from "../margot-tool-errors";

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

describe("formatImageGenerateFailure", () => {
  it("does not expose provider or storage exception details", () => {
    const result = formatImageGenerateFailure(
      new Error("Supabase upload failed with service_role_secret and bucket id"),
    );

    expect(result).toEqual({
      error: "image_generate failed",
      retryable: false,
    });
  });

  it("preserves retryability without returning raw error text", () => {
    const result = formatImageGenerateFailure(
      new Error("Gemini unavailable after timeout"),
    );

    expect(result).toEqual({
      error: "image_generate failed",
      retryable: true,
    });
  });
});
