import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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

    await prisma.portalInvitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });

    return NextResponse.json({ data: { id: invitation.id, status: "REVOKED" } });
  } catch (error) {
    console.error("Error revoking portal invitation:", error);
    return fromException(request, error, {
      stage: "portal/invitations:revoke",
    });
  }
}
