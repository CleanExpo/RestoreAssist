import { describe, expect, it } from "vitest";
import { importSketchUserMessage } from "../import-sketch-user-message";

describe("importSketchUserMessage", () => {
  it("maps 402 subscription", () => {
    expect(importSketchUserMessage(402, { code: "KEY_MISSING" })).toMatch(
      /subscription/i,
    );
  });

  it("maps rate limit with retry-after", () => {
    expect(
      importSketchUserMessage(429, { code: "RATE_LIMITED" }, "120"),
    ).toContain("120");
  });

  it("maps invalid image", () => {
    expect(importSketchUserMessage(400, { code: "INVALID_IMAGE" })).toMatch(
      /supported image/i,
    );
  });
});
