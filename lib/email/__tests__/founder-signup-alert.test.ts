/**
 * Launch-night Unit 4 — the founder must be told when a stranger signs up.
 *
 * Before this module existed, `notifyWelcome` created an in-app notification
 * for the NEW USER and nothing at all reached the founder. On launch night
 * that means overnight signups arrive silently: the only way to learn a
 * customer exists is to query the database by hand.
 *
 * Contract this locks in:
 *   1. When SIGNUP_ALERT_EMAIL is set, one transactional email is dispatched
 *      to it carrying the new account's identifying details.
 *   2. When SIGNUP_ALERT_EMAIL is unset, it is a NO-OP that reports why —
 *      it must never throw, because the caller runs inside the signup path
 *      and a thrown alert would break the money path it is watching.
 *   3. A provider outage is swallowed for the same reason.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.fn();

vi.mock("@/lib/email/send-transactional", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmail(...args),
}));

const SIGNUP = {
  userId: "user_123",
  name: "Jane Restorer",
  email: "jane@example.com",
  trialEndsAt: new Date("2026-09-09T00:00:00.000Z"),
  creditsRemaining: 50,
};

describe("sendFounderSignupAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    sendTransactionalEmail.mockResolvedValue({
      data: { id: "msg_1" },
      error: null,
    });
  });

  it("emails the configured founder address with the new account's details", async () => {
    vi.stubEnv("SIGNUP_ALERT_EMAIL", "founder@restoreassist.app");
    const { sendFounderSignupAlert } = await import("../founder-signup-alert");

    const result = await sendFounderSignupAlert(SIGNUP);

    expect(result.sent).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const payload = sendTransactionalEmail.mock.calls[0][0];
    expect(payload.to).toBe("founder@restoreassist.app");
    // The founder must be able to act on the alert without opening the app.
    expect(`${payload.subject} ${payload.html}`).toContain("jane@example.com");
    expect(`${payload.subject} ${payload.html}`).toContain("Jane Restorer");
  });

  it("is a no-op that reports why when SIGNUP_ALERT_EMAIL is unset", async () => {
    vi.stubEnv("SIGNUP_ALERT_EMAIL", "");
    const { sendFounderSignupAlert } = await import("../founder-signup-alert");

    const result = await sendFounderSignupAlert(SIGNUP);

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not_configured");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("never throws when the email provider fails — signup must not break", async () => {
    vi.stubEnv("SIGNUP_ALERT_EMAIL", "founder@restoreassist.app");
    sendTransactionalEmail.mockRejectedValue(new Error("provider down"));
    const { sendFounderSignupAlert } = await import("../founder-signup-alert");

    await expect(sendFounderSignupAlert(SIGNUP)).resolves.toEqual(
      expect.objectContaining({ sent: false, reason: "send_failed" }),
    );
  });

  it("reports not_sent when the provider returns a structured error", async () => {
    vi.stubEnv("SIGNUP_ALERT_EMAIL", "founder@restoreassist.app");
    sendTransactionalEmail.mockResolvedValue({
      data: null,
      error: { name: "not_configured", message: "no provider" },
    });
    const { sendFounderSignupAlert } = await import("../founder-signup-alert");

    const result = await sendFounderSignupAlert(SIGNUP);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("send_failed");
  });
});
