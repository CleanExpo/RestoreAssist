import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.fn();
const reportError = vi.fn();

vi.mock("@/lib/email/send-transactional", () => ({
  EMAIL_SEND_TIMEOUT_MS: 100,
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));
vi.mock("@/lib/email/resolve-platform-config", () => ({
  isEmailServiceConfigured: () => true,
  resolveFromAddress: () => "RestoreAssist <support@example.com>",
}));
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { sendInviteEmail, sendWelcomeEmail } from "@/lib/email";
import { EmailDeliveryRejected } from "@/lib/email-delivery-errors";

const invite = {
  email: "tech@example.com",
  name: "Tech",
  role: "USER" as const,
  inviteLink: `https://restoreassist.app/invite/${"a".repeat(48)}`,
  loginUrl: "https://restoreassist.app/login",
  inviterName: "Admin",
  organizationId: "org_1",
};

describe("sendInviteEmail delivery receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects provider absence instead of reporting a false success", async () => {
    sendTransactionalEmail.mockResolvedValueOnce({ data: null, error: null });

    await expect(sendInviteEmail(invite)).rejects.toThrow("missing_receipt");
    expect(reportError).toHaveBeenCalled();
  });

  it("classifies a definitive provider rejection separately from ambiguity", async () => {
    sendTransactionalEmail.mockResolvedValueOnce({
      data: null,
      error: { name: "mailtrap_401", message: "Unauthorized" },
    });

    await expect(sendInviteEmail(invite)).rejects.toMatchObject({
      name: "EmailDeliveryRejected",
    });
  });

  it.each(["mailtrap_missing_receipt", "resend_missing_receipt"])(
    "treats provider success without a durable receipt as ambiguous: %s",
    async (name) => {
      sendTransactionalEmail.mockResolvedValueOnce({
        data: null,
        error: { name, message: "provider returned success without an id" },
      });

      const error = await sendInviteEmail(invite).catch((caught) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(EmailDeliveryRejected);
    },
  );

  it("passes the organization identity through for BYOK resolution", async () => {
    sendTransactionalEmail.mockResolvedValueOnce({
      data: { id: "provider_receipt_1" },
      error: null,
    });

    await expect(sendInviteEmail(invite)).resolves.toMatchObject({
      data: { id: "provider_receipt_1" },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        to: "tech@example.com",
      }),
    );
    expect(sendTransactionalEmail.mock.calls[0][0]).not.toHaveProperty("from");
  });

  it("refuses a new-user email with no secure invitation link", async () => {
    await expect(
      sendInviteEmail({ ...invite, inviteLink: undefined }),
    ).rejects.toThrow("requires a secure invitation link");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("refuses a wrong-path invitation link", async () => {
    await expect(
      sendInviteEmail({
        ...invite,
        inviteLink: `https://restoreassist.app/signup?invite=${"a".repeat(48)}`,
      }),
    ).rejects.toThrow("requires a valid invitation URL");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("refuses an invitation link on a different origin from login", async () => {
    await expect(
      sendInviteEmail({
        ...invite,
        inviteLink: `https://attacker.example/invite/${"a".repeat(48)}`,
      }),
    ).rejects.toThrow("requires a valid invitation URL");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not log or return a best-effort welcome send without a provider receipt", async () => {
    sendTransactionalEmail.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      sendWelcomeEmail({
        recipientEmail: "owner@example.com",
        recipientName: "Owner",
        loginUrl: "https://restoreassist.app/login",
        trialDays: 15,
        trialCredits: 50,
      }),
    ).resolves.toBeNull();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing_receipt") }),
      expect.objectContaining({ stage: "email-welcome" }),
    );
  });
});
