/**
 * Upgrade specified accounts to LIFETIME access so they never hit
 * any paywall / trial-expired / subscription-required gate.
 *
 * Sets:
 *   - subscriptionStatus = 'ACTIVE' (passes the subscription gate per CLAUDE.md rule 8)
 *   - lifetimeAccess = true (skips the trial-expiry path)
 *   - creditsRemaining = 999999 (no AI cost cap)
 *   - quickFillCreditsRemaining = 999999
 *
 * Idempotent. Safe to re-run.
 *
 * Run:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"') \
 *     npx tsx scripts/upgrade-reviewer-to-lifetime.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGETS = [
  "reviewer@restoreassist.app", // Apple App Store reviewer demo account
  "phill.mcgurk@gmail.com", // Owner
];

async function upgradeOne(email: string) {
  const before = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      subscriptionStatus: true,
      lifetimeAccess: true,
      creditsRemaining: true,
      quickFillCreditsRemaining: true,
      role: true,
    },
  });
  if (!before) {
    console.log(`\n!!! User ${email} not found — skipping`);
    return;
  }
  console.log(`\n--- ${email} ---`);
  console.log("Current state:");
  console.log("  " + JSON.stringify(before));

  const after = await prisma.user.update({
    where: { email },
    data: {
      subscriptionStatus: "ACTIVE",
      lifetimeAccess: true,
      creditsRemaining: 999999,
      quickFillCreditsRemaining: 999999,
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    } as any,
    select: {
      id: true,
      subscriptionStatus: true,
      lifetimeAccess: true,
      creditsRemaining: true,
      quickFillCreditsRemaining: true,
      role: true,
    },
  });
  console.log("Updated state:");
  console.log("  " + JSON.stringify(after));
}

async function main() {
  console.log("=== Upgrading accounts to LIFETIME access ===");
  for (const email of TARGETS) {
    await upgradeOne(email);
  }
  console.log(
    "\n✓ Done. Sign out + sign back in on each account to refresh the JWT.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
