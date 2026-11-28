import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isPortalInvitationToken } from "@/lib/public-token-shape";
import { apiError, fromException } from "@/lib/api-errors";
import { markInvitationExpired } from "@/lib/portal/invitation-transitions";
import {
  looksLikeRecoveryToken,
  recoveryLinkIsLive,
  verifyRecoveryToken,
} from "@/lib/portal/recovery-token";

// GET /api/portal/invitations/verify?token=... - Verify invitation token
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-invitation-verify",
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Token is required",
        status: 400,
      });
    }

    // RA-8613: an emailed password-recovery link (stateless, never stored).
    if (looksLikeRecoveryToken(token)) {
      const claims = await verifyRecoveryToken(token);
      const account = claims
        ? await prisma.clientUser.findUnique({
            where: { id: claims.clientUserId },
            select: {
              clientId: true,
              email: true,
              name: true,
              passwordHash: true,
            },
          })
        : null;
      if (
        !claims ||
        !account ||
        account.clientId !== claims.clientId ||
        account.email.toLowerCase() !== claims.email.toLowerCase() ||
        !recoveryLinkIsLive(claims, account.passwordHash)
      ) {
        return NextResponse.json({
          valid: false,
          error: "This recovery link is invalid or has expired",
          status: "EXPIRED",
        });
      }
      return NextResponse.json({
        valid: true,
        recovery: true,
        invitation: {
          email: account.email,
          clientName: account.name,
          contractorName: "RestoreAssist",
          expiresAt: claims.expiresAt,
        },
      });
    }

    if (!isPortalInvitationToken(token)) {
      return NextResponse.json(
        {
          valid: false,
          error: "Invalid invitation token",
        },
        { status: 404 },
      );
    }

    const invitation = await prisma.portalInvitation.findUnique({
      where: { token },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          },
        },
        user: {
          select: {
            businessName: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        {
          valid: false,
          error: "Invalid invitation token",
        },
        { status: 404 },
      );
    }

    // Check if already accepted
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json({
        valid: false,
        error: "This invitation has already been accepted",
        status: "ACCEPTED",
      });
    }

    // Check if expired
    const now = new Date();
    if (invitation.status === "EXPIRED" || invitation.expiresAt < now) {
      // RA-8668: record the expiry only while the invitation is still pending
      // and still lapsed. One revoked, accepted or resent since the read above
      // is left as it is; the caller is told "expired" either way.
      if (invitation.status === "PENDING") {
        await markInvitationExpired(invitation.id, now);
      }
      return NextResponse.json({
        valid: false,
        error: "This invitation has expired",
        status: "EXPIRED",
      });
    }

    // Check if revoked
    if (invitation.status === "REVOKED") {
      return NextResponse.json({
        valid: false,
        error: "This invitation has been revoked",
        status: "REVOKED",
      });
    }

    // Valid invitation
    const contractorName =
      invitation.user.businessName || invitation.user.name || "RestoreAssist";

    return NextResponse.json({
      valid: true,
      invitation: {
        email: invitation.email,
        clientName: invitation.client.name,
        contractorName,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error verifying invitation:", error);
    return fromException(request, error, {
      stage: "portal/invitations/verify:get",
    });
  }
}
