import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withEmailTimeout, EMAIL_SEND_TIMEOUT_MS } from "../email";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withEmailTimeout", () => {
  it("resolves with the send result when the send completes in time", async () => {
    const result = withEmailTimeout(Promise.resolve({ data: { id: "e_1" } }));
    await expect(result).resolves.toEqual({ data: { id: "e_1" } });
  });

  it("rejects when the Resend call hangs past the timeout", async () => {
    const hung = new Promise(() => {
      // never settles — simulates a hung Resend upstream
    });
    const result = withEmailTimeout(hung);
    const assertion = expect(result).rejects.toThrow(
      `Email send timed out after ${EMAIL_SEND_TIMEOUT_MS}ms`,
    );
    await vi.advanceTimersByTimeAsync(EMAIL_SEND_TIMEOUT_MS + 1);
    await assertion;
  });

  it("propagates the send rejection unchanged", async () => {
    const failure = new Error("resend exploded");
    await expect(
      withEmailTimeout(Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it("honours a custom timeout", async () => {
    const hung = new Promise(() => {});
    const result = withEmailTimeout(hung, 500);
    const assertion = expect(result).rejects.toThrow(
      "Email send timed out after 500ms",
    );
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });
});
