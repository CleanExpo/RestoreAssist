import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";

/**
 * RA-8462 — cancel a pending team invite.
 *
 * An owner (ADMIN) can cancel any unused invite in their business; a manager
 * only the invites they created (the same rule as resend). Cancel is a soft
 * revoke, never a delete, so the row keeps who cancelled it and when:
 *   - the bearer token is rotated, so the emailed link no longer resolves in
 *     GET or POST /api/invites/[token];
 *   - expiresAt is set to the cancel time, so the technician seat count and
 *     the "active invite" check on create stop counting it at once.
 * usedAt is left null: it marks an acceptance, and membership history reads it.
 */
export async function DELETE(
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

  try {
    // Re-read role and organisation from the database, not the session claim.
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, organizationId: true },
    });
    if (
      !currentUser?.organizationId ||
      (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGER")
    ) {
      return apiError(req, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }
    const userId = currentUser.id;
    const organizationId = currentUser.organizationId;
    const isManager = currentUser.role === "MANAGER";
    const { id } = await params;

    const invite = await prisma.userInvite.findUnique({
      where: { id, organizationId },
      select: {
        id: true,
        email: true,
        usedAt: true,
        revokedAt: true,
        createdById: true,
      },
    });
    if (!invite) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Invite not found",
        status: 404,
      });
    }
    if (isManager && invite.createdById !== userId) {
      return apiError(req, {
        code: "FORBIDDEN",
        message: "You can only cancel invites you created",
        status: 403,
      });
    }
    if (invite.usedAt) {
      return apiError(req, {
        code: "CONFLICT",
        message:
          "This invite has already been accepted. Remove the team member instead.",
        status: 409,
      });
    }
    if (invite.revokedAt) {
      return NextResponse.json({
        message: "Invite already cancelled",
        invite: { id: invite.id, email: invite.email, revokedAt: invite.revokedAt },
      });
    }

    const now = new Date();
    // The where clause re-asserts what was read, so an accept that commits
    // first makes this a no-op instead of being overwritten.
    const result = await prisma.userInvite.updateMany({
      where: {
        id,
        organizationId,
        usedAt: null,
        revokedAt: null,
        ...(isManager ? { createdById: userId } : {}),
      },
      data: {
        revokedAt: now,
        revokedById: userId,
        expiresAt: now,
        token: randomBytes(24).toString("hex"),
      },
    });
    if (result.count !== 1) {
      return apiError(req, {
        code: "CONFLICT",
        message: "This invite changed while cancelling. Reload and try again.",
        status: 409,
      });
    }

    return NextResponse.json({
      message: "Invite cancelled",
      invite: { id: invite.id, email: invite.email, revokedAt: now },
    });
  } catch (error) {
    return fromException(req, error, { stage: "cancel-invite" });
  }
}
