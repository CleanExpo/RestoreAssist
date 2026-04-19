/**
 * GET /api/user/trial-status — RA-1241
 *
 * Returns the current user's subscription status and — if on trial — how many
 * whole days remain until `trialEndsAt`. Used by the dashboard TrialBanner to
 * surface urgency ("3 days left — upgrade to keep your reports").
 *
 * Shape:
 *   200 OK { subscriptionStatus: "TRIAL" | "ACTIVE" | ..., trialEndsAt: ISO|null, daysRemaining: number|null }
 *   401   { error: "Unauthorized" }
 *
 * Fire-and-forget friendly: never throws; on DB error returns a safe default.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });

    const trialEndsAt = user?.trialEndsAt ?? null;
    let daysRemaining: number | null = null;
    if (trialEndsAt) {
      const msRemaining = trialEndsAt.getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
    }

    return NextResponse.json({
      subscriptionStatus: user?.subscriptionStatus ?? null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      daysRemaining,
    });
  } catch (err) {
    // Never throw a 500 from a status-surface endpoint — dashboard would
    // swallow the banner silently. Return a safe shape the UI can ignore.
    console.error("[trial-status] db error:", err);
    return NextResponse.json({
      subscriptionStatus: null,
      trialEndsAt: null,
      daysRemaining: null,
    });
  }
}
