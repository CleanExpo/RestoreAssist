import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("@/lib/email/send-transactional", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendMock(...args),
  EMAIL_SEND_TIMEOUT_MS: 10_000,
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import {
  sendInviteEmail,
  sendPaymentFailedEmail,
  sendReportCompletedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
} from "../email";

const originalKey = process.env.MAILTRAP_API_KEY;
const originalFrom = process.env.SENDER_EMAIL;

const XSS = `<img src=x onerror="alert(1)">`;
const ESCAPED = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "test-id" }, error: null });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.MAILTRAP_API_KEY = "mt_test_key";
  process.env.SENDER_EMAIL = "Restore Assist <noreply@restoreassist.app>";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.MAILTRAP_API_KEY;
  else process.env.MAILTRAP_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.SENDER_EMAIL;
  else process.env.SENDER_EMAIL = originalFrom;
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

  it("escapes recipientName, subscriptionPlan, failureReason, currency and amount in sendPaymentFailedEmail", async () => {
    await sendPaymentFailedEmail({
      recipientEmail: "customer@example.com",
      recipientName: XSS,
      subscriptionPlan: XSS,
      amount: XSS,
      currency: XSS,
      failureReason: XSS,
      updatePaymentUrl: "https://app.restoreassist.app/billing",
    });

    const html = lastHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain(ESCAPED);
  });

  it("escapes recipientName, subscriptionPlan and expiresAt in sendSubscriptionCancelledEmail", async () => {
    await sendSubscriptionCancelledEmail({
      recipientEmail: "customer@example.com",
      recipientName: XSS,
      subscriptionPlan: XSS,
      expiresAt: XSS,
      resubscribeUrl: "https://app.restoreassist.app/billing",
    });

    const html = lastHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain(ESCAPED);
  });
});
