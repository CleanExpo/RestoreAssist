import { describe, it, expect, afterEach } from "vitest";
import { getFromEmail } from "../email";

describe("getFromEmail", () => {
  const originalSender = process.env.SENDER_EMAIL;
  const originalResend = process.env.RESEND_FROM_EMAIL;

  afterEach(() => {
    if (originalSender === undefined) delete process.env.SENDER_EMAIL;
    else process.env.SENDER_EMAIL = originalSender;
    if (originalResend === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalResend;
  });

  it("prefers SENDER_EMAIL over RESEND_FROM_EMAIL", () => {
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    process.env.RESEND_FROM_EMAIL = "Restore Assist <noreply@restoreassist.app>";
    expect(getFromEmail()).toBe("RestoreAssist <support@restoreassist.app>");
  });

  it("falls back to RESEND_FROM_EMAIL when SENDER_EMAIL is unset", () => {
    delete process.env.SENDER_EMAIL;
    process.env.RESEND_FROM_EMAIL = "Restore Assist <noreply@restoreassist.app>";
    expect(getFromEmail()).toBe("Restore Assist <noreply@restoreassist.app>");
  });

  it("throws fast when no sender is configured", () => {
    delete process.env.SENDER_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    expect(() => getFromEmail()).toThrow(/SENDER_EMAIL/);
  });
});
