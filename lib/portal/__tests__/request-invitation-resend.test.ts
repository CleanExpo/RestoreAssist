import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalInvitation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    clientUser: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/portal/extend-and-email-invitation", () => ({
  extendAndEmailPortalInvitation: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { extendAndEmailPortalInvitation } from "@/lib/portal/extend-and-email-invitation";
import { requestPortalInvitationResend } from "../request-invitation-resend";
import { GENERIC_INVITE_RESEND_MESSAGE } from "../recovery-paths";

const findMany = prisma.portalInvitation.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const clientUserFindFirst = prisma.clientUser.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const invitationFindFirst = prisma.portalInvitation
  .findFirst as unknown as ReturnType<typeof vi.fn>;
const invitationCreate = prisma.portalInvitation.create as unknown as ReturnType<
  typeof vi.fn
>;
const extend = extendAndEmailPortalInvitation as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  extend.mockResolvedValue({ ok: true, data: { expiresAt: new Date() } });
  clientUserFindFirst.mockResolvedValue(null);
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

  describe("account holder who lost the password (RA-8613)", () => {
    const ACCOUNT = { clientId: "client_1", email: "client@example.com" };
    const RECOVERY_INVITATION = {
      id: "inv_new",
      token: "tok_new",
      email: "client@example.com",
      client: { name: "Jordan Client" },
      user: {
        name: "Alex Tech",
        businessName: "Harbour Restorations",
        organizationId: "org_1",
      },
    };

    it("issues a new single-use link and emails it as a password reset", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);
      invitationFindFirst
        .mockResolvedValueOnce(null) // no open recovery link
        .mockResolvedValueOnce({ userId: "contractor_1" }); // accepted invite
      invitationCreate.mockResolvedValue(RECOVERY_INVITATION);

      const result = await requestPortalInvitationResend(" Client@Example.com ");

      expect(result).toEqual({
        ok: true,
        data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: true },
      });
      expect(invitationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "client@example.com",
            clientId: "client_1",
            userId: "contractor_1",
          }),
        }),
      );
      expect(extend).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationId: "inv_new",
          token: "tok_new",
          email: "client@example.com",
          kind: "recovery",
        }),
      );
    });

    it("reuses an open recovery link instead of minting another", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);
      invitationFindFirst.mockResolvedValueOnce(RECOVERY_INVITATION);

      await requestPortalInvitationResend("client@example.com");

      expect(invitationCreate).not.toHaveBeenCalled();
      expect(extend).toHaveBeenCalledWith(
        expect.objectContaining({ invitationId: "inv_new", kind: "recovery" }),
      );
    });

    it("returns the same message when the account has no accepted invitation", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);
      invitationFindFirst.mockResolvedValue(null);

      const result = await requestPortalInvitationResend("client@example.com");

      expect(result).toEqual({
        ok: true,
        data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: false },
      });
      expect(extend).not.toHaveBeenCalled();
    });

    it("returns the same message when the reset email fails", async () => {
      clientUserFindFirst.mockResolvedValue(ACCOUNT);
      invitationFindFirst.mockResolvedValueOnce(RECOVERY_INVITATION);
      extend.mockResolvedValue({ ok: false, reason: "email_failed" });

      const result = await requestPortalInvitationResend("client@example.com");

      expect(result).toEqual({
        ok: true,
        data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: true },
      });
    });
  });
});
