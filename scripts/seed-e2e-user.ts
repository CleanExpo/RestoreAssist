/**
 * RA-6764 — seed the deterministic e2e login account that `e2e/auth.setup.ts`
 * signs in as (E2E_USER_EMAIL / E2E_USER_PASSWORD).
 *
 * Writes directly to the DB (bypassing /signup) so it can set a bcrypt password
 * AND mark the org setup-complete — otherwise the middleware setup-gate would
 * 307-redirect the login away from /dashboard and auth.setup's
 * `expect(toHaveURL(/dashboard/))` would fail.
 *
 * Idempotent (upsert) — safe to re-run. Run against a LOCAL/EPHEMERAL DB:
 *   DATABASE_URL=... pnpm exec tsx scripts/seed-e2e-user.ts
 *
 * Subscription: ACTIVE (not TRIAL) so the hard-paywall middleware never
 * intercepts the e2e login flow regardless of how long it has been since the
 * last seed run. TRIAL + trialEndsAt expired was the original choice; it
 * caused smoke-prod failures after the first year and on production accounts
 * that pre-date the seed (RA-6764 hotfix).
 *
 * NOTE (RA-6764 / Option ii): authored without a local run. If `user.create`
 * rejects on a required-without-default column, add it here — the field set
 * mirrors app/api/auth/register/route.ts as of 2026-06-16.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = process.env.E2E_USER_EMAIL ?? "test@restoreassist.app";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Test1234!";

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashedPassword,
      role: "ADMIN",
      // ACTIVE so the hard-paywall never blocks the e2e account regardless
      // of time elapsed since seed was last run. trialEndsAt is cleared.
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
    },
    create: {
      name: "E2E Test User",
      email: EMAIL,
      password: hashedPassword,
      role: "ADMIN",
      subscriptionStatus: "ACTIVE",
      creditsRemaining: 999,
      totalCreditsUsed: 0,
      trialEndsAt: null,
      quickFillCreditsRemaining: 999,
      totalQuickFillUsed: 0,
    },
  });

  // Organization has no natural unique besides id; key off ownerId.
  const existingOrg = await prisma.organization.findFirst({
    where: { ownerId: user.id },
  });
  const orgData = {
    name: "E2E Test Organisation",
    ownerId: user.id,
    // Setup-gate prerequisites (business_profile check + setupCompletedAt) so the
    // seeded user lands on /dashboard, not /setup.
    legalName: "E2E Test Pty Ltd",
    abn: "53004085616", // valid ABN checksum
    state: "NSW",
    setupCompletedAt: new Date(),
  };
  const org = existingOrg
    ? await prisma.organization.update({
        where: { id: existingOrg.id },
        data: orgData,
      })
    : await prisma.organization.create({ data: orgData });

  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id },
  });

  console.log(
    `✓ Seeded e2e account ${EMAIL} (user ${user.id}, org ${org.id}, setup complete)`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-e2e-user] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
