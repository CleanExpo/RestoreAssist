import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Check Quick Fill credits
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        quickFillCreditsRemaining: true,
        totalQuickFillUsed: true,
        subscriptionStatus: true,
        organizationId: true,
        role: true,
        trialEndsAt: true,
      },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const isInvitedTeamMember =
      !!user.organizationId &&
      (user.role === "MANAGER" || user.role === "USER");
    const isTrialWithinPeriod =
      user.subscriptionStatus === "TRIAL" &&
      (!user.trialEndsAt || new Date() <= new Date(user.trialEndsAt));
    const hasUnlimited =
      user.subscriptionStatus === "ACTIVE" ||
      isInvitedTeamMember ||
      isTrialWithinPeriod;
    const creditsRemaining = hasUnlimited
      ? null
      : (user.quickFillCreditsRemaining ?? 0);

    return NextResponse.json({
      creditsRemaining,
      totalUsed: user.totalQuickFillUsed ?? 0,
      hasUnlimited,
      canUse: hasUnlimited || (creditsRemaining ?? 0) > 0,
    });
  } catch (error) {
    return fromException(request, error, { stage: "quick-fill:get" });
  }
}

// POST - Deduct Quick Fill credit
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: CRITICAL — this endpoint deducts credits. Retry without
  // idempotency would double-deduct.
  return withIdempotency(request, userId, async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          quickFillCreditsRemaining: true,
          totalQuickFillUsed: true,
          subscriptionStatus: true,
          organizationId: true,
          role: true,
          trialEndsAt: true,
        },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      const isInvitedTeamMember =
        !!user.organizationId &&
        (user.role === "MANAGER" || user.role === "USER");
      const isTrialWithinPeriod =
        user.subscriptionStatus === "TRIAL" &&
        (!user.trialEndsAt || new Date() <= new Date(user.trialEndsAt));
      if (
        user.subscriptionStatus === "ACTIVE" ||
        isInvitedTeamMember ||
        isTrialWithinPeriod
      ) {
        return NextResponse.json({
          success: true,
          creditsRemaining: null,
          hasUnlimited: true,
        });
      }

      const creditsRemaining = user.quickFillCreditsRemaining ?? 0;
      if (creditsRemaining <= 0) {
        // RA-1548 — left raw: rich shape with creditsRemaining/requiresUpgrade
        // siblings the client reads to drive the upgrade CTA.
        return NextResponse.json(
          {
            error:
              "No Quick Fill credits remaining. Please upgrade to continue using Quick Fill.",
            creditsRemaining: 0,
            requiresUpgrade: true,
          },
          { status: 403 },
        );
      }

      // Deduct credit and increment usage
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          quickFillCreditsRemaining: {
            decrement: 1,
          },
          totalQuickFillUsed: {
            increment: 1,
          },
        },
        select: {
          quickFillCreditsRemaining: true,
          totalQuickFillUsed: true,
        },
      });

      return NextResponse.json({
        success: true,
        creditsRemaining: updated.quickFillCreditsRemaining ?? 0,
        totalUsed: updated.totalQuickFillUsed ?? 0,
      });
    } catch (error) {
      return fromException(request, error, { stage: "quick-fill:post" });
    }
  });
}
