import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalInvitation: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    clientUser: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/portal/extend-and-email-invitation", () => ({
  extendAndEmailPortalInvitation: vi.fn(),
}));
vi.mock("@/lib/portal/recovery-email", () => ({
  emailRecoveryLink: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { extendAndEmailPortalInvitation } from "@/lib/portal/extend-and-email-invitation";
import { emailRecoveryLink } from "@/lib/portal/recovery-email";
import { requestPortalInvitationResend } from "../request-invitation-resend";
import { GENERIC_INVITE_RESEND_MESSAGE } from "../recovery-paths";

const findMany = prisma.portalInvitation.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const clientUserFindFirst = prisma.clientUser.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const invitationCreate = prisma.portalInvitation.create as unknown as ReturnType<
  typeof vi.fn
>;
const invitationUpdate = prisma.portalInvitation.update as unknown as ReturnType<
  typeof vi.fn
>;
const extend = extendAndEmailPortalInvitation as unknown as ReturnType<
  typeof vi.fn
>;
const recoveryEmail = emailRecoveryLink as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  extend.mockResolvedValue({ ok: true, data: { expiresAt: new Date() } });
  clientUserFindFirst.mockResolvedValue(null);
  recoveryEmail.mockResolvedValue(true);
});

describe("requestPortalInvitationResend", () => {
  it("rejects an address that is not an email", async () => {
    const result = await requestPortalInvitationResend("not-an-email");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_email");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns the same public message when nothing matches", async () => {
    findMany.mockResolvedValue([]);
    const result = await requestPortalInvitationResend("client@example.com");
    expect(result).toEqual({
      ok: true,
      data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: false },
    });
    expect(extend).not.toHaveBeenCalled();
  });

  it("resends the newest PENDING or EXPIRED invitation", async () => {
    findMany.mockResolvedValue([
      {
        id: "inv_1",
        token: "tok_1",
        email: "client@example.com",
        status: "EXPIRED",
        client: { name: "Jordan Client" },
        user: {
          name: "Alex Tech",
          businessName: "Harbour Restorations",
          organizationId: "org_1",
        },
      },
    ]);

    const result = await requestPortalInvitationResend("  Client@Example.com ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe(GENERIC_INVITE_RESEND_MESSAGE);
      expect(result.data.matched).toBe(true);
    }
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "client@example.com",
          status: { in: ["PENDING", "EXPIRED"] },
        },
        take: 5,
      }),
    );
    expect(extend).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId: "inv_1",
        kind: "reminder",
        contractorName: "Harbour Restorations",
      }),
    );
  });

  it("still returns the generic message when email sending fails", async () => {
    findMany.mockResolvedValue([
      {
        id: "inv_1",
        token: "tok_1",
        email: "client@example.com",
        status: "PENDING",
        client: { name: "Jordan Client" },
        user: { name: "Alex", businessName: null, organizationId: null },
      },
    ]);
    extend.mockResolvedValue({ ok: false, reason: "email_not_configured" });

    const result = await requestPortalInvitationResend("client@example.com");
    expect(result).toEqual({
      ok: true,
      data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: true },
    });
  });

  // RA-8613: the first design stored the recovery link as an invitation row, so
  // a contractor who listed invitations could read it and set the homeowner's
  // password. The link is now stateless: nothing is stored for a contractor
  // to read, and no invitation is created or extended.
  describe("account holder who lost the password (RA-8613)", () => {
    const ACCOUNT = {
      id: "client_user_1",
      clientId: "client_1",
      email: "client@example.com",
      name: "Jordan Client",
      passwordHash: "$2a$10$stored-hash",
    };

    it("emails a recovery link to the account address and stores no invitation", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);

      const result = await requestPortalInvitationResend(" Client@Example.com ");

      expect(result).toEqual({
        ok: true,
        data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: true },
      });
      expect(recoveryEmail).toHaveBeenCalledTimes(1);
      expect(recoveryEmail).toHaveBeenCalledWith({
        clientUserId: ACCOUNT.id,
        clientId: ACCOUNT.clientId,
        email: ACCOUNT.email,
        name: ACCOUNT.name,
        passwordHash: ACCOUNT.passwordHash,
      });
      expect(invitationCreate).not.toHaveBeenCalled();
      expect(invitationUpdate).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
      expect(extend).not.toHaveBeenCalled();
    });

    it("returns the same message when the recovery email fails", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);
      recoveryEmail.mockResolvedValue(false);

      const result = await requestPortalInvitationResend("client@example.com");

      expect(result).toEqual({
        ok: true,
        data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: false },
      });
    });
  });
});
