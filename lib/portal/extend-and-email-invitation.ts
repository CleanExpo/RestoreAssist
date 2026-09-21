import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { escapeHtml } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { fail, ok, type ServiceResult } from "@/lib/services/_shared/result";

export type InvitationEmailKind = "invite" | "reminder";

export type ExtendAndEmailInput = {
  invitationId: string;
  token: string;
  email: string;
  clientName: string;
  contractorName: string;
  organizationId: string | null;
  kind: InvitationEmailKind;
};

export type ExtendAndEmailFailure =
  | "email_not_configured"
  | "email_failed";

const INVITE_TTL_DAYS = 7;

export function buildPortalInvitationEmailHtml(input: {
  clientName: string;
  contractorName: string;
  inviteUrl: string;
  kind: InvitationEmailKind;
}): string {
  const clientName = escapeHtml(input.clientName);
  const contractorName = escapeHtml(input.contractorName);
  const heading =
    input.kind === "reminder"
      ? "Reminder: the client portal invitation is ready"
      : "Invited to the client portal";
  const lead =
    input.kind === "reminder"
      ? `This is a reminder that ${contractorName} invited you to the client portal.`
      : `${contractorName} invited you to the client portal.`;

  return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${heading}</h2>
            <p>Hi ${clientName},</p>
            <p>${lead} On the portal you can:</p>
            <ul>
              <li>View restoration project reports</li>
              <li>Review and approve scope of work</li>
              <li>Track project status</li>
              <li>Download documents the contractor has shared</li>
            </ul>
            <p style="margin: 30px 0;">
              <a href="${input.inviteUrl}" style="background-color: #8A6B4E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept invitation and create an account
              </a>
            </p>
            <p style="font-size: 12px; color: #666;">
              This invitation expires in ${INVITE_TTL_DAYS} days. If this was not expected, ignore the email.
            </p>
            <p style="font-size: 12px; color: #666;">
              Link not working? Copy and paste this address:<br/>
              ${input.inviteUrl}
            </p>
          </div>
        `;
}

export async function extendAndEmailPortalInvitation(
  input: ExtendAndEmailInput,
): Promise<ServiceResult<{ expiresAt: Date }, ExtendAndEmailFailure>> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  await prisma.portalInvitation.update({
    where: { id: input.invitationId },
    data: {
      expiresAt,
      status: "PENDING",
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://restoreassist.app";
  const inviteUrl = `${baseUrl}/portal/signup?token=${input.token}`;
  const subject =
    input.kind === "reminder"
      ? `Reminder: ${input.contractorName} invited you to view the restoration project`
      : `${input.contractorName} invited you to view the restoration project`;

  const result = await sendTransactionalEmail({
    organizationId: input.organizationId,
    to: input.email,
    subject,
    html: buildPortalInvitationEmailHtml({
      clientName: input.clientName,
      contractorName: input.contractorName,
      inviteUrl,
      kind: input.kind,
    }),
  });

  if (result.error) {
    if (result.error.name === "not_configured") {
      return fail("email_not_configured", {
        detail: result.error.message,
      });
    }
    return fail("email_failed", {
      detail: result.error.message ?? "Failed to send invitation email",
    });
  }

  return ok({ expiresAt });
}
