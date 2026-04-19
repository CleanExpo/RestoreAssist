/**
 * RA-1246 — Activation funnel analytics (admin-only).
 * GET /api/analytics/activation-funnel
 * Returns per-event counts in the last 30 days + conversion rates
 * relative to signup_completed.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";

const FUNNEL_STEPS = [
  "signup_completed",
  "first_report_started",
  "first_report_saved",
  "first_interview_completed",
  "first_integration_connected",
] as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await prisma.activationEvent.groupBy({
      by: ["eventName"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const step of FUNNEL_STEPS) counts[step] = 0;
    for (const row of rows) {
      counts[row.eventName] = row._count._all;
    }

    const signupCount = counts.signup_completed || 0;
    const conversionRates: Record<string, number | null> = {};
    for (const step of FUNNEL_STEPS) {
      conversionRates[step] =
        signupCount > 0 ? counts[step] / signupCount : null;
    }

    return NextResponse.json({
      data: {
        windowDays: 30,
        since: since.toISOString(),
        counts,
        conversionRates,
      },
    });
  } catch (error) {
    console.error("[activation-funnel] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
