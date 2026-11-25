/**
 * RA-8355: a sales email must carry a working opt-out. The opt-out pieces
 * (reply-to, List-Unsubscribe header, visible unsubscribe line) come from one
 * owner, and the win-back email must call it and send a plain-text part.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.fn();
vi.mock("@/lib/email/send-transactional", () => ({
  EMAIL_SEND_TIMEOUT_MS: 10_000,
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));
vi.mock("@/lib/email/resolve-platform-config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/email/resolve-platform-config")
  >()),
  isEmailServiceConfigured: () => true,
  resolveFromAddress: () => "RestoreAssist <noreply@restoreassist.app>",
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { BRAND } from "@/lib/brand";
import { marketingOptOut } from "../marketing-opt-out";
import { sendWinbackEmail } from "@/lib/email";

const originalReplyTo = process.env.EMAIL_REPLY_TO;

beforeEach(() => {
  sendTransactionalEmail.mockReset();
  sendTransactionalEmail.mockResolvedValue({
    data: { id: "msg_1" },
    error: null,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  delete process.env.EMAIL_REPLY_TO;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalReplyTo === undefined) delete process.env.EMAIL_REPLY_TO;
  else process.env.EMAIL_REPLY_TO = originalReplyTo;
});

describe("marketingOptOut", () => {
  it("uses the support mailbox when EMAIL_REPLY_TO is unset", () => {
    const optOut = marketingOptOut();
    const support = BRAND.company.supportEmail;
    expect(optOut.replyTo).toBe(support);
    expect(optOut.headers["List-Unsubscribe"]).toBe(
      `<mailto:${support}?subject=Unsubscribe>`,
    );
    expect(optOut.footerHtml).toContain(
      `href="mailto:${support}?subject=Unsubscribe"`,
    );
    expect(optOut.footerHtml).toMatch(/unsubscribe/i);
    expect(optOut.footerText).toContain(support);
    expect(optOut.footerText).toMatch(/unsubscribe/i);
    expect(optOut.footerHtml).toContain("Unite-Group Nexus Pty Ltd");
  });

  it("prefers EMAIL_REPLY_TO, the same rule as the re-engagement route", () => {
    process.env.EMAIL_REPLY_TO = "replies@restoreassist.app";
    const optOut = marketingOptOut();
    expect(optOut.replyTo).toBe("replies@restoreassist.app");
    expect(optOut.headers["List-Unsubscribe"]).toBe(
      "<mailto:replies@restoreassist.app?subject=Unsubscribe>",
    );
  });

  // RA-8355 review finding: the mailto was built by raw interpolation, so a
  // mailbox character that is valid in an address (# or ?) moved the opt-out
  // to a different target, and a display-name value produced a malformed URI.
  it("percent-encodes # and ? so the link and header keep the whole mailbox", () => {
    process.env.EMAIL_REPLY_TO = "support#team@example.com";
    const hash = marketingOptOut();
    expect(hash.headers["List-Unsubscribe"]).toBe(
      "<mailto:support%23team@example.com?subject=Unsubscribe>",
    );
    const url = new URL(
      hash.headers["List-Unsubscribe"].slice(1, -1),
    );
    expect(decodeURIComponent(url.pathname)).toBe("support#team@example.com");
    expect(url.hash).toBe("");
    expect(hash.replyTo).toBe("support#team@example.com");

    process.env.EMAIL_REPLY_TO = "a?b@example.com";
    const query = marketingOptOut();
    const queryUrl = new URL(query.headers["List-Unsubscribe"].slice(1, -1));
    expect(decodeURIComponent(queryUrl.pathname)).toBe("a?b@example.com");
    expect(queryUrl.search).toBe("?subject=Unsubscribe");
  });

  it("reduces a display-name value to its one mailbox everywhere", () => {
    process.env.EMAIL_REPLY_TO = "Support Team <replies@restoreassist.app>";
    const optOut = marketingOptOut();
    expect(optOut.replyTo).toBe("replies@restoreassist.app");
    expect(optOut.headers["List-Unsubscribe"]).toBe(
      "<mailto:replies@restoreassist.app?subject=Unsubscribe>",
    );
    expect(optOut.footerHtml).toContain(
      'href="mailto:replies@restoreassist.app?subject=Unsubscribe"',
    );
    expect(optOut.footerText).toContain("replies@restoreassist.app");
    expect(optOut.footerText).not.toContain("<");
  });

  it.each([
    ["line break", "a@example.com\r\nBcc: x@example.com"],
    ["a list", "a@example.com, b@example.com"],
    ["no domain", "support"],
    ["spaces", "a b@example.com"],
    ["blank", "   "],
  ])("falls back to the support mailbox for %s", (_label, value) => {
    process.env.EMAIL_REPLY_TO = value;
    const optOut = marketingOptOut();
    const support = BRAND.company.supportEmail;
    expect(optOut.replyTo).toBe(support);
    expect(optOut.headers["List-Unsubscribe"]).toBe(
      `<mailto:${support}?subject=Unsubscribe>`,
    );
    expect(optOut.headers["List-Unsubscribe"]).not.toMatch(/[\r\n]/);
  });

  it("escapes a hostile mailbox in the HTML footer", () => {
    process.env.EMAIL_REPLY_TO = 'x"onmouseover=alert(1)@example.com';
    const optOut = marketingOptOut();
    expect(optOut.footerHtml).not.toContain('"onmouseover');
  });
});

describe("sendWinbackEmail opt-out", () => {
  async function sentInput() {
    await sendWinbackEmail({
      recipientEmail: "owner@example.com",
      recipientName: "Sam",
      resubscribeUrl: "https://restoreassist.app/pricing",
      daysSinceExpired: 30,
    });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    return sendTransactionalEmail.mock.calls[0][0] as {
      replyTo?: string;
      headers?: Record<string, string>;
      html: string;
      text?: string;
    };
  }

  it("sets replyTo to the monitored mailbox", async () => {
    const input = await sentInput();
    expect(input.replyTo).toBe(BRAND.company.supportEmail);
  });

  it("sends the List-Unsubscribe mailto header", async () => {
    const input = await sentInput();
    expect(input.headers?.["List-Unsubscribe"]).toBe(
      `<mailto:${BRAND.company.supportEmail}?subject=Unsubscribe>`,
    );
  });

  it("shows a visible unsubscribe line in the body", async () => {
    const input = await sentInput();
    expect(input.html).toContain(marketingOptOut().footerHtml);
    expect(input.html).not.toContain("stop sending these");
  });

  it("sends a plain-text part carrying the unsubscribe line", async () => {
    const input = await sentInput();
    expect(input.text).toBeTruthy();
    expect(input.text).toContain("https://restoreassist.app/pricing");
    expect(input.text).toContain(marketingOptOut().footerText);
  });
});
