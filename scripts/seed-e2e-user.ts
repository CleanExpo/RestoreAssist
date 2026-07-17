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
 * NOTE (RA-6764 / Option ii): authored without a local run. If `user.create`
 * rejects on a required-without-default column, add it here — the field set
 * mirrors app/api/auth/register/route.ts as of 2026-06-16.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// Prisma 7's pg driver adapter requires an explicit adapter at construction;
// a bare `new PrismaClient()` throws PrismaClientInitializationError (this is
// what broke the Sketch E2E seed step, RA-7079). Mirror lib/prisma.ts.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the e2e user");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString, max: 2 })),
});

const EMAIL = process.env.E2E_USER_EMAIL ?? "test@restoreassist.app";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Test1234!";

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashedPassword,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      trialEndsAt: oneYear,
    },
    create: {
      name: "E2E Test User",
      email: EMAIL,
      password: hashedPassword,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 999,
      totalCreditsUsed: 0,
      trialEndsAt: oneYear,
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
