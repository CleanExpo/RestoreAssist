import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "../api-error-message";

describe("apiErrorMessage", () => {
  it("returns the string when error is a plain string (legacy shape)", () => {
    expect(apiErrorMessage({ error: "Email already in use" })).toBe(
      "Email already in use",
    );
  });

  it("returns the inner message when error is the new envelope shape", () => {
    expect(
      apiErrorMessage({
        error: {
          code: "VALIDATION",
          message: "Password too short",
          eventId: "x1",
        },
      }),
    ).toBe("Password too short");
  });

  it("returns null when data is missing / not an object", () => {
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage(undefined)).toBeNull();
    expect(apiErrorMessage("oops")).toBeNull();
    expect(apiErrorMessage(42)).toBeNull();
  });

  it("returns null when there is no error key at all", () => {
    expect(apiErrorMessage({ data: { ok: true } })).toBeNull();
  });

  it("returns null when error is an object but has no string message", () => {
    expect(apiErrorMessage({ error: { code: "X", eventId: "y" } })).toBeNull();
    expect(apiErrorMessage({ error: { message: 42 } })).toBeNull();
  });

  it("ignores unknown error shapes safely (returns null, never throws)", () => {
    expect(apiErrorMessage({ error: ["array", "of", "things"] })).toBeNull();
    expect(apiErrorMessage({ error: true })).toBeNull();
  });
});
