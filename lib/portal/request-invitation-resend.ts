import { prisma } from "@/lib/prisma";
import { extendAndEmailPortalInvitation } from "@/lib/portal/extend-and-email-invitation";
import {
  GENERIC_INVITE_RESEND_MESSAGE,
  isLikelyEmail,
  normaliseRecoveryEmail,
} from "@/lib/portal/recovery-paths";
import { fail, ok, type ServiceResult } from "@/lib/services/_shared/result";

export type RequestInviteResendFailure = "invalid_email";

export type RequestInviteResendData = {
  message: string;
  /** Internal only — never expose on the public HTTP body. */
  matched: boolean;
};

const RECOVERY_TTL_DAYS = 7;

/**
 * Public recovery: resend a PENDING or EXPIRED portal invitation for an email.
 * Always returns the same client message so the address cannot be enumerated.
 * REVOKED and ACCEPTED invitations are never resent.
 *
 * RA-8613: when the email belongs to an existing portal account, a fresh
 * single-use invitation is issued and emailed as a "set a new password" link.
 * Accepting it (invitations/accept) proves control of that address and sets
 * the password; knowing the address alone is never enough.
 */
export async function requestPortalInvitationResend(
  rawEmail: string,
): Promise<ServiceResult<RequestInviteResendData, RequestInviteResendFailure>> {
  if (!isLikelyEmail(rawEmail)) {
    return fail("invalid_email", { detail: "Enter a valid email address" });
  }

  const email = normaliseRecoveryEmail(rawEmail);

  const accountHolder = await prisma.clientUser.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { clientId: true, email: true },
  });
  if (accountHolder) {
    const matched = await emailAccountRecoveryLink(
      accountHolder.clientId,
      accountHolder.email,
    );
    return ok({ message: GENERIC_INVITE_RESEND_MESSAGE, matched });
  }

  const invitations = await prisma.portalInvitation.findMany({
    where: {
      email,
      status: { in: ["PENDING", "EXPIRED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      token: true,
      email: true,
      status: true,
      client: { select: { name: true } },
      user: {
        select: {
          name: true,
          businessName: true,
          organizationId: true,
        },
      },
    },
  });

  const invitation = invitations[0];
  if (!invitation) {
    return ok({
      message: GENERIC_INVITE_RESEND_MESSAGE,
      matched: false,
    });
  }

  const contractorName =
    invitation.user.businessName || invitation.user.name || "RestoreAssist";

  await extendAndEmailPortalInvitation({
    invitationId: invitation.id,
    token: invitation.token,
    email: invitation.email,
    clientName: invitation.client.name,
    contractorName,
    organizationId: invitation.user.organizationId,
    kind: "reminder",
  });

  // Email failure is swallowed on the public path so a 503 cannot be used
  // as an existence oracle. The generic message still points at the contractor.
  return ok({
    message: GENERIC_INVITE_RESEND_MESSAGE,
    matched: true,
  });
}

const INVITATION_EMAIL_SELECT = {
  id: true,
  token: true,
  email: true,
  client: { select: { name: true } },
  user: {
    select: { name: true, businessName: true, organizationId: true },
  },
} as const;

/**
 * Reuse an open recovery link for this account if one exists (so repeated
 * requests do not mint a pile of live links), otherwise issue a new one from
 * the contractor who sent the accepted invitation. Returns whether an email
 * was attempted; the caller never exposes that.
 */
async function emailAccountRecoveryLink(
  clientId: string,
  accountEmail: string,
): Promise<boolean> {
  let invitation = await prisma.portalInvitation.findFirst({
    where: {
      clientId,
      email: accountEmail,
      status: { in: ["PENDING", "EXPIRED"] },
    },
    orderBy: { createdAt: "desc" },
    select: INVITATION_EMAIL_SELECT,
  });

  if (!invitation) {
    const accepted = await prisma.portalInvitation.findFirst({
      where: { clientId, email: accountEmail, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    });
    if (!accepted) return false;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + RECOVERY_TTL_DAYS);
    invitation = await prisma.portalInvitation.create({
      data: {
        email: accountEmail,
        clientId,
        userId: accepted.userId,
        expiresAt,
      },
      select: INVITATION_EMAIL_SELECT,
    });
  }

  await extendAndEmailPortalInvitation({
    invitationId: invitation.id,
    token: invitation.token,
    email: invitation.email,
    clientName: invitation.client.name,
    contractorName:
      invitation.user.businessName || invitation.user.name || "RestoreAssist",
    organizationId: invitation.user.organizationId,
    kind: "recovery",
  });
  return true;
}
