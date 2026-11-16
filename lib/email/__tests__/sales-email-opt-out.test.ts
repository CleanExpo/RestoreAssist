/**
 * RA-8356: every sender the register classes "sales" must carry the opt-out
 * built by buildMarketingOptOut(). The list of senders comes from the
 * register, not from this file, so classing a new sender "sales" puts it
 * under this test, and a sales sender with no sample below fails.
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

import * as email from "@/lib/email";
import { buildMarketingOptOut } from "@/lib/email/marketing-opt-out";
import { salesSenders } from "@/lib/email/sender-register";

/** One realistic call per sales sender. Keyed by sender name. */
const SAMPLES: Record<string, unknown> = {
  sendTrialExpiringEmail: {
    recipientEmail: "trial@example.com",
    recipientName: "Trial User",
    daysRemaining: 3,
    subscribeUrl: "https://restoreassist.app/dashboard/pricing",
  },
  sendWinbackEmail: {
    recipientEmail: "lapsed@example.com",
    recipientName: "Lapsed User",
    resubscribeUrl: "https://restoreassist.app/dashboard/pricing",
    daysSinceExpired: 30,
  },
  sendReengagementEmail: {
    recipientEmail: "quiet@example.com",
    recipientName: "Quiet User",
    ctaUrl: "https://restoreassist.app/dashboard/pricing",
  },
};

interface SentInput {
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

async function sendAndCapture(name: string): Promise<SentInput> {
  const sender = (email as unknown as Record<string, unknown>)[name];
  expect(typeof sender, `${name} is exported from lib/email.ts`).toBe(
    "function",
  );
  await (sender as (data: unknown) => Promise<unknown>)(SAMPLES[name]);
  expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  return sendTransactionalEmail.mock.calls[0][0] as SentInput;
}

describe("every sales email carries the opt-out (RA-8356)", () => {
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

  it("has a sample for every registered sales sender", () => {
    const sales = salesSenders();
    expect(sales.length).toBeGreaterThan(0);
    expect(Object.keys(SAMPLES).sort()).toEqual(sales);
  });

  for (const name of salesSenders()) {
    describe(name, () => {
      it("sends the List-Unsubscribe header and monitored reply-to from the one owner", async () => {
        const optOut = buildMarketingOptOut();
        const input = await sendAndCapture(name);
        expect(input.headers?.["List-Unsubscribe"]).toBe(
          optOut.headers["List-Unsubscribe"],
        );
        expect(input.replyTo).toBe(optOut.replyTo);
      });

      it("shows the unsubscribe line in the HTML and the plain-text part", async () => {
        const optOut = buildMarketingOptOut();
        const input = await sendAndCapture(name);
        expect(input.html).toContain(
          `mailto:${optOut.replyTo}?subject=Unsubscribe`,
        );
        expect(input.html).toMatch(/To unsubscribe, email/);
        expect(typeof input.text).toBe("string");
        expect(input.text).toContain(optOut.textFooter);
      });

      it("follows EMAIL_REPLY_TO when it is set", async () => {
        process.env.EMAIL_REPLY_TO = "replies@restoreassist.app";
        const input = await sendAndCapture(name);
        expect(input.replyTo).toBe("replies@restoreassist.app");
        expect(input.headers?.["List-Unsubscribe"]).toBe(
          "<mailto:replies@restoreassist.app?subject=Unsubscribe>",
        );
      });
    });
  }
});
