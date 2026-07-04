/**
 * RA-1131: Adjuster AI Agent API
 *
 * POST /api/pilot/adjuster-session
 *   Runs the adjuster AI agent for a given inspection and returns a structured
 *   recommendation object.
 *
 *   Body: { inspectionId: string }
 *
 *   Gates:
 *   - Session auth (getServerSession)
 *   - Rate limit: 10 requests / 15 min per user (session.user.id)
 *   - Subscription gate: TRIAL | ACTIVE | LIFETIME only
 *   - Atomic credit deduction (updateMany where creditsRemaining >= 1)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { runAdjusterAgent } from "@/lib/ai/adjuster-agent";
import {
  deductCreditsAndTrackUsage,
  refundCreditsAndTrackUsage,
} from "@/lib/report-limits";
import { apiError } from "@/lib/api-errors";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"] as const;

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;

    // ── 2. Rate limit (by user ID — rule 10) ──────────────────────────────────
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "adjuster-agent",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    // ── 3. Subscription gate (rule 8) ─────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        user.subscriptionStatus as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
      )
    ) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "Active subscription required",
        status: 402,
      });
    }

    // ── 4. Parse body ─────────────────────────────────────────────────────────
    const body = (await request.json()) as { inspectionId?: unknown };
    if (!body.inspectionId || typeof body.inspectionId !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "inspectionId is required",
        status: 400,
      });
    }
    const { inspectionId } = body;

    // ── 4b. Tenancy check (RA-6961) ───────────────────────────────────────────
    // Must run BEFORE credit deduction — otherwise a caller can burn their
    // own credit to run the agent (and read the analysis) against another
    // tenant's inspection.
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // ── 5. Atomic credit deduction (rule 9) ───────────────────────────────────
    try {
      await deductCreditsAndTrackUsage(userId);
    } catch (creditError) {
      if (
        creditError instanceof Error &&
        creditError.message === "INSUFFICIENT_CREDITS"
      ) {
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message: "No credits remaining. Please subscribe to continue.",
          status: 402,
        });
      }
      throw creditError;
    }

    // ── 6. Run adjuster agent ─────────────────────────────────────────────────
    // The credit was deducted above, BEFORE this slow external call. If the
    // agent 404s/throws, the user has been charged for a result they never
    // received (RA-6968) — refund the deducted credit before surfacing the
    // error. refundCreditsAndTrackUsage is best-effort and never throws, so it
    // cannot mask the original failure nor double-charge the happy path.
    let recommendation: Awaited<ReturnType<typeof runAdjusterAgent>>;
    try {
      recommendation = await runAdjusterAgent(inspectionId);
    } catch (agentError) {
      await refundCreditsAndTrackUsage(userId);
      throw agentError;
    }

    return NextResponse.json({ data: recommendation }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    return apiError(request, {
      code: "INTERNAL",
      message: "Internal server error",
      status: 500,
      err: error,
      stage: "adjuster-session:post",
    });
  }
}
