/**
 * RA-7008 — seed the five pilot-canary owner accounts the swarm harness
 * logs in as (packages/pilot-tester/src/companies/fixtures.ts companyKeys).
 *
 * Writes directly to the DB (bypassing /signup) so it can set a bcrypt
 * password AND mark each org setup-complete — mirrors scripts/seed-e2e-user.ts
 * and the field set of app/api/auth/register/route.ts.
 *
 * Idempotent (upsert) — safe to re-run; re-running rotates the passwords.
 * Run against the SANDBOX DB only:
 *   DATABASE_URL=... pnpm exec tsx scripts/seed-pilot-users.ts
 *
 * On success it prints the exact PILOT_TESTER_USER_POOL_JSON payload to
 * stdout — pipe it straight into the repo secret:
 *   DATABASE_URL=... pnpm exec tsx scripts/seed-pilot-users.ts \
 *     | tail -1 | gh secret set PILOT_TESTER_USER_POOL_JSON
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// RA-7008 founder decision (2026-07-09): NO separate sandbox database — the
// sandbox deployment shares the production DB, and the canary's safety model
// is identity containment (pilot-* accounts only, least privilege, capped
// credits) rather than DB isolation. Seeding synthetic accounts into the
// shared DB is therefore a deliberate act: require an explicit
// acknowledgment flag so it can never happen by accident.
const PROD_DB_REF = /\budooysjajglluvuxkijp\b/i;
if (
  PROD_DB_REF.test(process.env.DATABASE_URL ?? "") &&
  process.env.ALLOW_SHARED_PROD_DB !== "1"
) {
  console.error(
    "[seed-pilot-users] DATABASE_URL matches the production database ref. " +
      "Per the RA-7008 shared-DB decision this is allowed ONLY with " +
      "ALLOW_SHARED_PROD_DB=1 set explicitly.",
  );
  process.exit(2);
}

const prisma = new PrismaClient();

/** Keys must match packages/pilot-tester/src/companies/fixtures.ts exactly. */
const PILOT_COMPANIES = [
  { companyKey: "beyond-clean", workspaceName: "Beyond Clean (sandbox pilot)" },
  {
    companyKey: "elite-restoration",
    workspaceName: "Elite Restoration (sandbox pilot)",
  },
  { companyKey: "crsa", workspaceName: "CRSA (sandbox pilot)" },
  {
    companyKey: "tropical-recovery",
    workspaceName: "Tropical Recovery (sandbox pilot)",
  },
  { companyKey: "outback-clean", workspaceName: "Outback Clean (sandbox pilot)" },
] as const;

/** 24 chars from a 64-symbol alphabet — clears the ≥12-char register floor. */
function generatePassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^";
  return Array.from(randomBytes(24), (b) => alphabet[b % alphabet.length]).join(
    "",
  );
}

async function main() {
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pool: Array<{
    email: string;
    password: string;
    workspaceName: string;
    companyKey: string;
  }> = [];

  for (const { companyKey, workspaceName } of PILOT_COMPANIES) {
    const email = `pilot-${companyKey}@restoreassist.sandbox`;
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Least privilege on the shared DB: plain USER role (each pilot owns only
    // its own org) and a hard credit cap — the per-account AI budget ceiling.
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        role: "USER",
        subscriptionStatus: "TRIAL",
        trialEndsAt: oneYear,
        creditsRemaining: 25,
      },
      create: {
        name: `Pilot ${workspaceName}`,
        email,
        password: hashedPassword,
        role: "USER",
        subscriptionStatus: "TRIAL",
        creditsRemaining: 25,
        totalCreditsUsed: 0,
        trialEndsAt: oneYear,
        quickFillCreditsRemaining: 25,
        totalQuickFillUsed: 0,
      },
    });

    const existingOrg = await prisma.organization.findFirst({
      where: { ownerId: user.id },
    });
    const orgData = {
      name: workspaceName,
      ownerId: user.id,
      legalName: `${workspaceName} Pty Ltd`,
      abn: "53004085616", // valid ABN checksum (same test ABN as the e2e seeder)
      state: "QLD",
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

    pool.push({ email, password, workspaceName, companyKey });
    console.error(`✓ Seeded pilot ${companyKey} (user ${user.id}, org ${org.id})`);
  }

  // The ONLY stdout line — pipeable straight into `gh secret set`. Passwords
  // intentionally included: this JSON *is* the secret payload.
  console.log(JSON.stringify(pool));
}

main()
  .catch((err) => {
    console.error("[seed-pilot-users] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
