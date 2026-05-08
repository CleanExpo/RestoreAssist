/**
 * CEO / Founder permanent access seed.
 *
 * Idempotent upsert that elevates the founder accounts to:
 *   - role: ADMIN
 *   - lifetimeAccess: true                  (the existing boolean used by
 *                                            lib/organization-credits.ts to
 *                                            force status=ACTIVE, plan=Lifetime,
 *                                            credits=999999)
 *   - subscriptionStatus: ACTIVE            (matches what lifetimeAccess
 *                                            forces at runtime; written for
 *                                            consistency at rest)
 *   - subscriptionPlan: lifetime
 *   - subscriptionEndsAt: null              (never expires)
 *   - trialEndsAt: null                     (no trial gating)
 *   - creditsRemaining / quickFillCreditsRemaining: 999_999 (best-effort —
 *                                            credit deduction code reads
 *                                            lifetimeAccess and bypasses)
 *   - hasPremiumInspectionReports: true
 *   - needsOnboarding: false                (skip /onboarding redirect)
 *
 * Does NOT touch the password column — auth still goes through bcrypt as
 * normal. The seed only flips role + subscription flags. If a row does
 * not exist (second account hasn't signed up yet) the seed creates a
 * placeholder row with NO password; that account must complete normal
 * signup at /signup to set a password — at which point /api/auth/register
 * will see the existing row and the password column will be hashed in
 * place. Re-run the seed afterwards to re-assert the flags.
 *
 * Run:
 *   npx tsx prisma/seed-ceo.ts
 *
 * Safe to run multiple times. Each run logs what it changed.
 *
 * Why a separate seed (not seed-demo or a migration):
 *   - CLAUDE.md rule #5: migrations are for DDL; data goes in seeds.
 *   - seed-demo creates a fictional dataset; CEO seed is real-account
 *     elevation — keeping them separate avoids accidentally clobbering
 *     real flags during a demo refresh.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CeoAccount {
  email: string;
  name: string;
  description: string;
}

const CEO_ACCOUNTS: CeoAccount[] = [
  {
    email: "phill.mcgurk@gmail.com",
    name: "Phill McGurk",
    description: "Founder / CEO — primary account",
  },
  {
    email: "airestoreassist@gmail.com",
    name: "RestoreAssist Admin",
    description:
      "Founder / CEO — secondary account (Apple correspondence inbox)",
  },
];

async function elevateAccount(account: CeoAccount): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: account.email },
    select: { id: true, password: true },
  });

  const elevatedFields = {
    role: "ADMIN" as const,
    subscriptionStatus: "ACTIVE" as const,
    subscriptionPlan: "lifetime",
    lifetimeAccess: true,
    subscriptionEndsAt: null,
    trialEndsAt: null,
    creditsRemaining: 999_999,
    totalCreditsUsed: 0,
    quickFillCreditsRemaining: 999_999,
    totalQuickFillUsed: 0,
    hasPremiumInspectionReports: true,
    needsOnboarding: false,
    mustChangePassword: false,
  };

  if (existing) {
    await prisma.user.update({
      where: { email: account.email },
      data: elevatedFields as any,
    });
    const hasPassword = Boolean(existing.password);
    console.log(
      `✓ Elevated existing account: ${account.email} (${account.description})`,
    );
    if (!hasPassword) {
      console.log(
        `  ⚠️  No password on file — sign in via OAuth (Google) or use forgot-password to set one.`,
      );
    }
    return;
  }

  // No existing row — create placeholder. Password stays null until
  // the user completes normal signup. Auth will reject the row until
  // a password is set, but the elevated flags persist.
  await prisma.user.create({
    data: {
      email: account.email,
      name: account.name,
      ...elevatedFields,
    } as any,
  });
  console.log(
    `✓ Created placeholder for: ${account.email} (${account.description})`,
  );
  console.log(
    `  ℹ️  No password set. User must complete signup at /signup with this exact email — registration will see the existing row and write the bcrypt hash in place. Re-run this seed afterwards to re-assert the flags.`,
  );
}

async function main(): Promise<void> {
  console.log("👑 RestoreAssist CEO Access Seed");
  console.log("────────────────────────────────────");

  for (const account of CEO_ACCOUNTS) {
    try {
      await elevateAccount(account);
    } catch (err) {
      console.error(
        `❌ Failed to elevate ${account.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  console.log("────────────────────────────────────");
  console.log("✅ CEO access seeded.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
