import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extendAndEmailPortalInvitation } from "@/lib/portal/extend-and-email-invitation";
import { apiError, fromException } from "@/lib/api-errors";

// POST /api/portal/invitations/[id]/resend - Resend invitation email
export async function POST(
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

    // Find invitation
    const invitation = await prisma.portalInvitation.findFirst({
      where: {
        id: invitationId,
        userId: session.user.id, // Verify ownership
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          },
        },
        user: {
          select: {
            name: true,
            businessName: true,
            organizationId: true,
          },
        },
      },
    });

    if (!invitation) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invitation not found",
        status: 404,
      });
    }

    // Can't resend if already accepted
    if (invitation.status === "ACCEPTED") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invitation already accepted",
        status: 400,
      });
    }

    const contractorName =
      invitation.user.businessName || invitation.user.name || "RestoreAssist";

    const result = await extendAndEmailPortalInvitation({
      invitationId: invitation.id,
      token: invitation.token,
      email: invitation.email,
      clientName: invitation.client.name,
      contractorName,
      organizationId: invitation.user.organizationId,
      kind: "reminder",
    });

    if (!result.ok) {
      if (result.reason === "email_not_configured") {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: "Email service not configured",
          status: 503,
          stage: "portal/invitations/resend:email-config",
        });
      }
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: result.detail ?? "Failed to resend invitation email",
        status: 502,
        stage: "portal/invitations/resend:email-send",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Invitation resent successfully",
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    return fromException(request, error, {
      stage: "portal/invitations/resend:post",
    });
  }
}
