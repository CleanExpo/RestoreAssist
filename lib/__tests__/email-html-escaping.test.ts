import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the payload handed to Resend so we can assert on the rendered HTML.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import {
  sendInviteEmail,
  sendReportCompletedEmail,
  sendSubscriptionActivatedEmail,
} from "../email";

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;

// A payload that injects markup + an event handler. If interpolated raw it
// becomes live HTML in the recipient's inbox (phishing / HTML injection).
const XSS = `<img src=x onerror="alert(1)">`;
const ESCAPED = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Restore Assist <noreply@restoreassist.app>";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalFrom;
});

function lastHtml(): string {
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][0].html as string;
}

describe("email HTML injection (rule 10 — escapeHtml on user-controlled fields)", () => {
  it("escapes inviterName in sendInviteEmail (transfer path)", async () => {
    await sendInviteEmail({
      email: "invitee@example.com",
      name: XSS,
      role: "USER",
      loginUrl: "https://app.restoreassist.app/login",
      inviterName: XSS,
      isTransfer: true,
    });

    const html = lastHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain(ESCAPED);
  });

  it("escapes recipientName, completedByName, reportJobNumber and reportType in sendReportCompletedEmail", async () => {
    await sendReportCompletedEmail({
      recipientEmail: "manager@example.com",
      recipientName: XSS,
      reportJobNumber: XSS,
      reportType: XSS,
      completedByName: XSS,
      viewReportUrl: "https://app.restoreassist.app/reports/1",
    });

    const html = lastHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain(ESCAPED);
  });

  it("escapes planName and recipientName in sendSubscriptionActivatedEmail", async () => {
    await sendSubscriptionActivatedEmail({
      recipientEmail: "customer@example.com",
      recipientName: XSS,
      planName: XSS,
      amount: 49,
      currency: "AUD",
      dashboardUrl: "https://app.restoreassist.app/dashboard",
    });

    const html = lastHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain(ESCAPED);
  });
});
