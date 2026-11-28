import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { revokeOpenInvitation } from "@/lib/portal/invitation-transitions";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.userType === "client") {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: invitationId } = await params;

    const invitation = await prisma.portalInvitation.findFirst({
      where: { id: invitationId, userId: session.user.id },
      select: { id: true, status: true },
    });

    if (!invitation) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invitation not found",
        status: 404,
      });
    }

    if (invitation.status === "ACCEPTED") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Cannot revoke an invitation that was already accepted",
        status: 400,
      });
    }

    if (invitation.status === "REVOKED") {
      return NextResponse.json({ data: { id: invitation.id, status: "REVOKED" } });
    }

    // RA-8668: revoke only while the invitation is still open. One accepted
    // since the read above is left accepted, and the caller is told so.
    if (await revokeOpenInvitation(invitation.id, session.user.id)) {
      return NextResponse.json({
        data: { id: invitation.id, status: "REVOKED" },
      });
    }

    const current = await prisma.portalInvitation.findFirst({
      where: { id: invitation.id, userId: session.user.id },
      select: { status: true },
    });
    if (!current) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invitation not found",
        status: 404,
      });
    }
    if (current.status === "REVOKED") {
      return NextResponse.json({
        data: { id: invitation.id, status: "REVOKED" },
      });
    }
    if (current.status === "ACCEPTED") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Cannot revoke an invitation that was already accepted",
        status: 400,
      });
    }
    return apiError(request, {
      code: "CONFLICT",
      message: "This invitation changed while it was being revoked. Try again.",
      status: 409,
    });
  } catch (error) {
    console.error("Error revoking portal invitation:", error);
    return fromException(request, error, {
      stage: "portal/invitations:revoke",
    });
  }
}
