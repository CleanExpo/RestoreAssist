/**
 * RA-6940 — shared active-subscription gate for paid proxy routes.
 *
 * Mirrors the inline gate used by the report-generation routes
 * (app/api/reports/generate-enhanced/route.ts, generate-inspection-report):
 * CANCELED / PAST_DUE / EXPIRED users must not trigger requests that incur
 * real provider cost. Returns a 402 NextResponse to short-circuit with, or
 * null when the user may proceed — same calling convention as applyRateLimit.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const ALLOWED_SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "LIFETIME",
] as const;

export async function requireActiveSubscription(
  userId: string,
): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  if (
    !user ||
    !ALLOWED_SUBSCRIPTION_STATUSES.includes(
      (user.subscriptionStatus ?? "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    return NextResponse.json(
      {
        error: "Active subscription required",
        upgradeRequired: true,
      },
      { status: 402 },
    );
  }

  return null;
}
