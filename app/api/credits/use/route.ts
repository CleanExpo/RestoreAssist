import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveSubscription,
  getOrganizationOwner,
} from "@/lib/organization-credits";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

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

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    prefix: "credits-use",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: CRITICAL — deducts billing credits. Retry without
  // idempotency would double-deduct.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let parsed: unknown;
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Request body must be a JSON object",
          status: 400,
        });
      }
      const rawCredits = (parsed as { credits?: number }).credits ?? 1;
      // Validate: credits must be a positive integer between 1 and 100
      if (!Number.isInteger(rawCredits) || rawCredits < 1 || rawCredits > 100) {
        return apiError(request, {
          code: "VALIDATION",
          message: "credits must be an integer between 1 and 100",
          status: 400,
        });
      }
      const credits = rawCredits as number;

      // Get effective subscription (Admin's for Managers/Technicians)
      const effectiveSub = await getEffectiveSubscription(userId);

      if (!effectiveSub) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      // Only TRIAL, ACTIVE, and LIFETIME subscriptions may consume credits
      const ALLOWED_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
      if (!ALLOWED_STATUSES.includes(effectiveSub.subscriptionStatus ?? "")) {
        // RA-1548 — the two 402s here carry an `upgradeRequired` (and
        // `creditsRemaining`) sibling the client reads to drive the upgrade
        // CTA, so they stay on raw NextResponse.
        return NextResponse.json(
          { error: "Active subscription required", upgradeRequired: true },
          { status: 402 },
        );
      }

      const ownerId = await getOrganizationOwner(userId);
      const targetUserId = ownerId || userId;

      // Trial users: the 15-day trial is CAPPED at a fixed credit grant, so
      // every report consumed deducts one credit (no "unlimited" bypass). The
      // expired-trial case is handled by the ALLOWED_STATUSES gate upstream
      // (trialEndsAt enforcement lives in canCreateReport/checkAndUpdateTrialStatus);
      // here we simply spend from the remaining balance atomically, matching the
      // paid-credit deduction below.

      let updatedUser: {
        creditsRemaining: number | null;
        totalCreditsUsed: number | null;
        subscriptionStatus: string | null;
      } | null;

      if (effectiveSub.subscriptionStatus === "TRIAL") {
        // Atomic compare-and-decrement: only succeeds if balance covers the cost.
        // Prevents two simultaneous requests from both passing the balance check and
        // both spending from the same credit balance (classic read-modify-write race).
        const result = await prisma.user.updateMany({
          where: { id: targetUserId, creditsRemaining: { gte: credits } },
          data: {
            creditsRemaining: { decrement: credits },
            totalCreditsUsed: { increment: credits },
          },
        });
        if (result.count === 0) {
          return NextResponse.json(
            {
              error: "Insufficient credits",
              creditsRemaining: 0,
              upgradeRequired: true,
            },
            { status: 402 },
          );
        }
        updatedUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            creditsRemaining: true,
            totalCreditsUsed: true,
            subscriptionStatus: true,
          },
        });
      } else {
        // ACTIVE/LIFETIME subscribers: track usage only, no credit deduction
        updatedUser = await prisma.user.update({
          where: { id: targetUserId },
          data: { totalCreditsUsed: { increment: credits } },
          select: {
            creditsRemaining: true,
            totalCreditsUsed: true,
            subscriptionStatus: true,
          },
        });
      }

      return NextResponse.json({
        success: true,
        creditsRemaining: updatedUser?.creditsRemaining ?? null,
        totalCreditsUsed: updatedUser?.totalCreditsUsed ?? 0,
        subscriptionStatus: updatedUser?.subscriptionStatus ?? null,
      });
    } catch (error) {
      return fromException(request, error, { stage: "use-credits" });
    }
  });
}
