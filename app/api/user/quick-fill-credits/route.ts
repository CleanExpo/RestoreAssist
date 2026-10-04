import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { isEffectivePlanCurrent } from "@/lib/billing/subscription-gate";

/**
 * RA-7893 — Quick Fill follows the business owner's plan.
 *
 * Invited MANAGER/USER members used to get unlimited Quick Fill whatever the
 * owner's plan said. The effective plan (getEffectiveSubscription: the owner's
 * for an invited member, the user's own otherwise; lifetime reads as ACTIVE)
 * now decides, and any metered credit is the billing account's. A missing
 * owner row resolves to null, which the handlers refuse.
 */
async function resolveQuickFillAccount(userId: string) {
  const effective = await getEffectiveSubscription(userId);
  if (!effective) return null;
  return {
    billingUserId: effective.id,
    // ACTIVE (lifetime included) or a TRIAL whose end date has not passed;
    // a TRIAL with no end date fails closed (isCurrentTrial).
    hasUnlimited: isEffectivePlanCurrent(effective),
  };
}

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

    const account = await resolveQuickFillAccount(session.user.id);
    const user = account
      ? await prisma.user.findUnique({
          where: { id: account.billingUserId },
          select: {
            quickFillCreditsRemaining: true,
            totalQuickFillUsed: true,
          },
        })
      : null;

    if (!account || !user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { hasUnlimited } = account;
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
      const account = await resolveQuickFillAccount(userId);
      if (!account) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      if (account.hasUnlimited) {
        return NextResponse.json({
          success: true,
          creditsRemaining: null,
          hasUnlimited: true,
        });
      }

      // Atomic: deduct credit only if remaining >= 1
      const r = await prisma.user.updateMany({
        where: {
          id: account.billingUserId,
          quickFillCreditsRemaining: { gte: 1 },
        },
        data: {
          quickFillCreditsRemaining: { decrement: 1 },
          totalQuickFillUsed: { increment: 1 },
        },
      });

      if (r.count === 0) {
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

      // Fetch updated state for response
      const updated = await prisma.user.findUnique({
        where: { id: account.billingUserId },
        select: {
          quickFillCreditsRemaining: true,
          totalQuickFillUsed: true,
        },
      });

      return NextResponse.json({
        success: true,
        creditsRemaining: updated?.quickFillCreditsRemaining ?? 0,
        totalUsed: updated?.totalQuickFillUsed ?? 0,
      });
    } catch (error) {
      return fromException(request, error, { stage: "quick-fill:post" });
    }
  });
}
