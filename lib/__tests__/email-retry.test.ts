import { describe, expect, it, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/observability", () => ({ reportError }));

import { sendWithRetry } from "@/lib/email-retry";

describe("sendWithRetry delivery receipts", () => {
  it("never retries a missing receipt because acceptance is ambiguous", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "msg_3" }, error: null });

    await expect(
      sendWithRetry(send, {
        stage: "welcome",
        maxAttempts: 3,
        baseDelayMs: 0,
      }),
    ).rejects.toThrow("confirmed message ID");
    expect(send).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty data", { data: null, error: null }],
    ["blank id", { data: { id: "  " }, error: null }],
  ])("fails after bounded retries for %s", async (_case, result) => {
    const send = vi.fn().mockResolvedValue(result);

    await expect(
      sendWithRetry(send, {
        stage: "welcome",
        maxAttempts: 2,
        baseDelayMs: 0,
      }),
    ).rejects.toThrow("confirmed message ID");
      expect(send).toHaveBeenCalledTimes(1);
  });
});
