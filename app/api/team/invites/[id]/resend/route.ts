import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
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
  const userId = session.user.id;
  const { id } = await params;

  // Re-fetch role and orgId from DB — JWT claims can be stale (CLAUDE.md rule 3)
  const callerDb = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, organizationId: true },
  });
  if (!callerDb) return apiError(req, { code: "NOT_FOUND", message: "User not found", status: 404 });

  if (!canResendInvite(callerDb.role)) {
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });
  }

  // RA-1266: prevents spamming the invitee with duplicate emails when
  // the admin double-clicks "Resend".
  return withIdempotency(req, userId, async () => {
    try {
      // Find the invite
      const invite = await prisma.userInvite.findUnique({
        where: { id },
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true, organizationId: true },
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

      // Verify the invite belongs to the user's organization (use DB-sourced orgId)
      if (invite.organizationId !== callerDb.organizationId) {
        return apiError(req, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      // Managers can only resend invites they created
      if (callerDb.role === "MANAGER" && invite.createdById !== userId) {
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
          where: { id },
          data: {
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Get inviter's name
      const inviter = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      const inviterName = inviter?.name || "Administrator";
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;

      // Check if a user account exists for this email
      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email.toLowerCase() },
      });

      // Resend the email
      await sendInviteEmail({
        email: invite.email,
        name: existingUser?.name || invite.email.split("@")[0],
        role: invite.role as any,
        tempPassword: undefined, // Password not included on resend — user already has credentials
        loginUrl,
        inviterName,
        isTransfer: !!existingUser,
      });

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
