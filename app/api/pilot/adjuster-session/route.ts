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
import { deductCreditsAndTrackUsage } from "@/lib/report-limits";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"] as const;

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        user.subscriptionStatus as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    // ── 4. Parse body ─────────────────────────────────────────────────────────
    const body = (await request.json()) as { inspectionId?: unknown };
    if (!body.inspectionId || typeof body.inspectionId !== "string") {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 },
      );
    }
    const { inspectionId } = body;

    // ── 5. Atomic credit deduction (rule 9) ───────────────────────────────────
    try {
      await deductCreditsAndTrackUsage(userId);
    } catch (creditError) {
      if (
        creditError instanceof Error &&
        creditError.message === "INSUFFICIENT_CREDITS"
      ) {
        return NextResponse.json(
          { error: "No credits remaining. Please subscribe to continue." },
          { status: 402 },
        );
      }
      throw creditError;
    }

    // ── 6. Run adjuster agent ─────────────────────────────────────────────────
    const recommendation = await runAdjusterAgent(inspectionId);

    return NextResponse.json({ data: recommendation }, { status: 200 });
  } catch (error) {
    console.error("[adjuster-session] error:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
