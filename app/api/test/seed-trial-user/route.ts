/**
 * TEST-ONLY route — seeds a TRIAL user (or any subscriptionStatus) with N days
 * remaining until trialEndsAt. Used by SP-3 T18 E2E specs to materialise users
 * at specific points along the trial-expiry curve (3-day, 1-day, 0-day, etc.)
 * without waiting real-world time.
 *
 * HARD GUARD — returns 403 unless ALLOW_TEST_HELPERS === "true".
 * Same convention as seed-inspection / sign-in-as siblings.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

const Body = z.object({
  daysUntilExpiry: z.number().int(),
  subscriptionStatus: z
    .enum(["TRIAL", "ACTIVE", "CANCELED", "EXPIRED", "PAST_DUE"])
    .default("TRIAL"),
});

export async function POST(request: NextRequest) {
  // RA-6940 defence-in-depth (same hard-block as sign-in-as): even if
  // ALLOW_TEST_HELPERS were ever true in a production deploy, VERCEL_ENV
  // must prevent seeding users into the production database.
  if (
    process.env.ALLOW_TEST_HELPERS !== "true" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return apiError(request, {
      code: "FORBIDDEN",
      message: "Test helpers disabled",
      status: 403,
    });
  }

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid body",
      status: 400,
    });
  }
  const { daysUntilExpiry, subscriptionStatus } = parsed.data;

  const trialEndsAt = new Date(
    Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000,
  );
  const email = `trial-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  const user = await prisma.user.create({
    data: {
      email,
      password: "hash",
      subscriptionStatus,
      trialEndsAt,
      creditsRemaining: 100,
    },
  });

  return NextResponse.json({
    data: {
      id: user.id,
      email: user.email,
      daysRemaining: daysUntilExpiry,
      subscriptionStatus,
    },
  });
}
