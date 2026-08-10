import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { sendWithRetry } from "@/lib/email-retry";
import { getAppUrl } from "@/lib/app-url";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

function canResendInvite(role?: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

      // Check if invite is expired and update if needed
      const now = new Date();
      if (invite.expiresAt < now) {
        // Extend expiration by 7 days
        await prisma.userInvite.update({
          // RA-6800: re-assert the invite's tenant on the write as well as the
          // lookup so an organisation change cannot cross the mutation boundary.
          where: {
            id,
            organizationId,
          },
          data: {
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      const inviterName = currentUser.name || "Administrator";
      const loginUrl = `${getAppUrl()}/login`;

      // Check if a user account exists for this email
      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email.toLowerCase() },
      });

      // Resend the email. A send failure must NOT 500 the request — the
      // invite expiry may already have been extended above, so report the
      // partial outcome instead (matches the 207 idiom in ../route.ts).
      try {
        await sendWithRetry(
          () =>
            sendInviteEmail({
              email: invite.email,
              name: existingUser?.name || invite.email.split("@")[0],
              role: invite.role as any,
              tempPassword: undefined, // Password not included on resend — user already has credentials
              loginUrl,
              inviterName,
              isTransfer: !!existingUser,
              organizationId,
            }),
          { stage: "invite-resend" },
        );
      } catch (emailError: any) {
        console.error(
          "[invite] Resend email failed for invite:",
          invite.id,
          emailError?.message || "Unknown error",
        );
        return NextResponse.json(
          {
            message:
              "Invite updated, but the email could not be sent. Please try again shortly.",
            error: "Email sending failed",
            invite: {
              id: invite.id,
              email: invite.email,
              role: invite.role,
              expiresAt: invite.expiresAt,
            },
          },
          { status: 207 }, // 207 Multi-Status — matches ../route.ts idiom
        );
      }

      return NextResponse.json({
        message: "Invite email resent successfully",
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
      });
    } catch (error: any) {
      console.error("Error resending invite:", error);
      return fromException(req, error, { stage: "resend-invite" });
    }
  });
}
