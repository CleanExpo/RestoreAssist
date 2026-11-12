/**
 * RA-8355 — the win-back email is a sales email and must carry a working
 * opt-out: a monitored reply-to, an RFC 2369 List-Unsubscribe header, a
 * visible unsubscribe line, and a plain-text part. Each assertion fails if
 * its piece is removed from sendWinbackEmail or buildMarketingOptOut.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.fn();

vi.mock("@/lib/email/send-transactional", () => ({
  EMAIL_SEND_TIMEOUT_MS: 10_000,
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));
vi.mock("@/lib/email/resolve-platform-config", () => ({
  isEmailServiceConfigured: () => true,
  resolveFromAddress: () => "RestoreAssist <noreply@restoreassist.app>",
}));

import { sendWinbackEmail } from "@/lib/email";
import { BRAND } from "@/lib/brand";

const DATA = {
  recipientEmail: "owner@example.com",
  recipientName: "Owner",
  resubscribeUrl: "https://restoreassist.app/dashboard/pricing",
  daysSinceExpired: 30,
};

function sentInput() {
  expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  return sendTransactionalEmail.mock.calls[0][0] as {
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  };
}

describe("sendWinbackEmail opt-out (RA-8355)", () => {
  const originalReplyTo = process.env.EMAIL_REPLY_TO;

  beforeEach(() => {
    sendTransactionalEmail.mockReset();
    sendTransactionalEmail.mockResolvedValue({
      data: { id: "msg_1" },
      error: null,
    });
    delete process.env.EMAIL_REPLY_TO;
  });

  afterEach(() => {
    if (originalReplyTo === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = originalReplyTo;
  });

  it("sets replyTo to the support mailbox when EMAIL_REPLY_TO is unset", async () => {
    await sendWinbackEmail(DATA);
    expect(sentInput().replyTo).toBe(BRAND.company.supportEmail);
  });

  it("prefers EMAIL_REPLY_TO for replyTo, header and footer", async () => {
    process.env.EMAIL_REPLY_TO = "replies@restoreassist.app";
    await sendWinbackEmail(DATA);
    const input = sentInput();
    expect(input.replyTo).toBe("replies@restoreassist.app");
    expect(input.headers?.["List-Unsubscribe"]).toBe(
      "<mailto:replies@restoreassist.app?subject=Unsubscribe>",
    );
    expect(input.html).toContain("replies@restoreassist.app");
    expect(input.text).toContain("replies@restoreassist.app");
  });

  it("sends an RFC 2369 List-Unsubscribe mailto header", async () => {
    await sendWinbackEmail(DATA);
    expect(sentInput().headers?.["List-Unsubscribe"]).toBe(
      `<mailto:${BRAND.company.supportEmail}?subject=Unsubscribe>`,
    );
  });

  it("shows a visible unsubscribe line naming the mailbox in the HTML body", async () => {
    await sendWinbackEmail(DATA);
    const { html } = sentInput();
    expect(html).toMatch(/To unsubscribe, email/);
    expect(html).toContain(
      `href="mailto:${BRAND.company.supportEmail}?subject=Unsubscribe"`,
    );
  });

  it("has a plain-text part with the CTA link and the unsubscribe line", async () => {
    await sendWinbackEmail(DATA);
    const { text } = sentInput();
    expect(typeof text).toBe("string");
    expect(text).toContain(DATA.resubscribeUrl);
    expect(text).toMatch(/To unsubscribe, email/);
    expect(text).toContain(BRAND.company.supportEmail);
  });
});
