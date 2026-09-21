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

/**
 * Public recovery: resend a PENDING or EXPIRED portal invitation for an email.
 * Always returns the same client message so the address cannot be enumerated.
 * REVOKED and ACCEPTED invitations are left alone.
 */
export async function requestPortalInvitationResend(
  rawEmail: string,
): Promise<ServiceResult<RequestInviteResendData, RequestInviteResendFailure>> {
  if (!isLikelyEmail(rawEmail)) {
    return fail("invalid_email", { detail: "Enter a valid email address" });
  }

  const email = normaliseRecoveryEmail(rawEmail);

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
