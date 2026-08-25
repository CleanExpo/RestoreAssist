import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { getIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import {
  deliverEmailOnce,
  EmailDeliveryPending,
} from "@/lib/email-delivery-ledger";
import { randomBytes } from "node:crypto";

function canResendInvite(role?: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = validateCsrf(req, { requireOrigin: true });
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let currentUser: {
    id: string;
    name: string | null;
    role: string;
    organizationId: string | null;
  } | null;
  try {
    currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, role: true, organizationId: true },
    });
  } catch (error) {
    return fromException(req, error, { stage: "resend-invite-auth" });
  }

  if (
    !currentUser ||
    !currentUser.organizationId ||
    !canResendInvite(currentUser.role)
  ) {
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });
  }
  const userId = currentUser.id;
  const organizationId = currentUser.organizationId;
  const currentRole = currentUser.role;
  const { id } = await params;

  const idempotency = getIdempotencyKey(req);
  if (!idempotency.ok || !idempotency.key) {
    return apiError(req, {
      code: "VALIDATION",
      message: idempotency.ok
        ? "Idempotency-Key is required"
        : idempotency.reason,
      status: 400,
    });
  }

  // RA-1266: prevents spamming the invitee with duplicate emails when
  // the admin double-clicks "Resend".
  return withIdempotency(req, userId, async () => {
    try {
      // Find the invite
      const invite = await prisma.userInvite.findUnique({
        where: { id, organizationId },
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      if (!invite) {
        return apiError(req, {
          code: "NOT_FOUND",
          message: "Invite not found",
          status: 404,
        });
      }

      // Managers can only resend invites they created
      if (currentRole === "MANAGER" && invite.createdById !== userId) {
        return apiError(req, {
          code: "FORBIDDEN",
          message: "You can only resend invites you created",
          status: 403,
        });
      }

      // Check if invite is already used
      if (invite.usedAt) {
        return apiError(req, {
          code: "VALIDATION",
          message: "This invite has already been used",
          status: 400,
        });
      }

      if (invite.role !== "MANAGER" && invite.role !== "USER") {
        return apiError(req, {
          code: "CONFLICT",
          message: "This invitation carries an unsupported role",
          status: 409,
        });
      }
      const inviteRole: "MANAGER" | "USER" = invite.role;

      const inviterName = currentUser.name || "Administrator";
      const loginUrl = `${getAppUrl()}/login`;

      // Check if a user account exists for this email
      const existingUser = await prisma.user.findFirst({
        where: {
          email: { equals: invite.email, mode: "insensitive" },
        },
      });
      if (existingUser) {
        return apiError(req, {
          code: "CONFLICT",
          message:
            "An account now exists for this email. Contact support if its organization membership needs review.",
          status: 409,
        });
      }

      // A resend is a security rotation, not an expiry revival. Rotate the
      // bearer token before provider I/O so every previously copied link stays
      // invalid even if the replacement email has an ambiguous outcome.
      const effectiveExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const rotatedToken = randomBytes(24).toString("hex");
      await prisma.userInvite.update({
        where: {
          id,
          organizationId,
          usedAt: null,
          role: inviteRole,
          token: invite.token,
        },
        data: { token: rotatedToken, expiresAt: effectiveExpiresAt },
      });
      const deliveryKey = `team-invite-resend:${invite.id}:${rotatedToken}`;
      const inviteLink = `${getAppUrl()}/invite/${rotatedToken}`;

      try {
        await deliverEmailOnce({
          idempotencyKey: deliveryKey,
          kind: "TEAM_INVITE_RESEND",
          recipient: invite.email,
          payloadIdentity: `${invite.id}|${rotatedToken}|${organizationId}`,
          send: () =>
            sendInviteEmail({
              email: invite.email,
              name: invite.email.split("@")[0],
              role: inviteRole,
              inviteLink,
              loginUrl,
              inviterName,
              organizationId,
              idempotencyKey: deliveryKey,
            }),
        });
      } catch (emailError: any) {
        console.error(
          "[invite] Resend email failed for invite:",
          invite.id,
          emailError?.message || "Unknown error",
        );
        return NextResponse.json(
          {
            message:
              "The old invite link was revoked, but delivery of the replacement link could not be confirmed. Reconcile the delivery before retrying.",
            error: "Email sending failed",
            invite: {
              id: invite.id,
              email: invite.email,
              role: inviteRole,
              expiresAt: effectiveExpiresAt,
            },
            partial: true,
          },
          { status: emailError instanceof EmailDeliveryPending ? 409 : 502 },
        );
      }

      return NextResponse.json({
        message: "Invite email resent successfully",
        invite: {
          id: invite.id,
          email: invite.email,
          role: inviteRole,
          expiresAt: effectiveExpiresAt,
        },
      });
    } catch (error: any) {
      console.error("Error resending invite:", error);
      return fromException(req, error, { stage: "resend-invite" });
    }
  });
}
