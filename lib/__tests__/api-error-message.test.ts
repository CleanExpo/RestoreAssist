import { describe, expect, it } from "vitest";
import {
  apiErrorMessage,
  toastDisplayMessage,
} from "../api-error-message";

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

  it("returns message when given the bare { code, message, eventId } object", () => {
    expect(
      apiErrorMessage({
        code: "RATE_LIMITED",
        message: "Too many requests",
        eventId: "evt_9",
      }),
    ).toBe("Too many requests");
  });

  it("returns Error.message for Error instances", () => {
    expect(apiErrorMessage(new Error("network down"))).toBe("network down");
  });

  it("returns null when data is missing / not an object", () => {
    expect(apiErrorMessage(null)).toBeNull();
    expect(apiErrorMessage(undefined)).toBeNull();
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

describe("toastDisplayMessage", () => {
  it("never returns an object — bare API errors become their message string", () => {
    const out = toastDisplayMessage({
      code: "FORBIDDEN",
      message: "Not allowed",
      eventId: "evt_1",
    });
    expect(out).toBe("Not allowed");
    expect(typeof out).toBe("string");
  });

  it("falls back when nothing readable is present", () => {
    expect(toastDisplayMessage({ code: "X" })).toBe("Something went wrong");
    expect(toastDisplayMessage(null, "Fallback")).toBe("Fallback");
  });
});
