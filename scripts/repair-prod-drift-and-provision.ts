/**
 * Repair prod schema drift + provision App Store reviewer account.
 *
 * Drift discovered 2026-04-29: 3 migrations recorded as applied in
 * `_prisma_migrations` but the corresponding columns never created.
 *
 *   1. 20260420100000_ra_1459_cloud_mirror_provider → User.cloudMirrorProvider TEXT
 *   2. 20260421000000_ra_1363_trial_reminder_idempotency → User.trialReminderSentAt JSONB
 *   3. 20260421040000_ra_1443_user_is_junior_technician → User.isJuniorTechnician BOOLEAN
 *      (already repaired in a prior run, but `IF NOT EXISTS` makes it idempotent)
 *
 * All three are additive, nullable (or default-NOT-NULL), zero risk to existing rows.
 *
 * Run ONCE against prod:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"') \
 *     npx tsx scripts/repair-prod-drift-and-provision.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const ORG_NAME = "Apple Reviewer Workspace";

function generatePassword(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = alpha + digits + symbols;
  const bytes = crypto.randomBytes(20);
  let out = "";
  out += alpha[bytes[0] % alpha.length];
  out += alpha[bytes[1] % alpha.length].toUpperCase();
  out += digits[bytes[2] % digits.length];
  out += symbols[bytes[3] % symbols.length];
  for (let i = 4; i < 20; i++) {
    out += all[bytes[i] % all.length];
  }
  return out;
}

const driftRepairs: Array<{ column: string; sql: string }> = [
  {
    column: "cloudMirrorProvider",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cloudMirrorProvider" TEXT`,
  },
  {
    column: "trialReminderSentAt",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trialReminderSentAt" JSONB`,
  },
  {
    column: "isJuniorTechnician",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isJuniorTechnician" BOOLEAN NOT NULL DEFAULT false`,
  },
];

async function main() {
  console.log("=== Step 1: repair prod schema drift on User table ===");
  for (const repair of driftRepairs) {
    await prisma.$executeRawUnsafe(repair.sql);
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name = $1`,
      repair.column,
    );
    if (cols.length === 0) {
      throw new Error(
        `ALTER TABLE for ${repair.column} reported success but column still missing — aborting`,
      );
    }
    console.log(`  ✓ ${repair.column} present`);
  }

  console.log("\n=== Step 2: provision reviewer account ===");
  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    create: {
      email: REVIEWER_EMAIL,
      name: "Apple App Reviewer",
      password: hashed,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 30,
      totalCreditsUsed: 0,
      quickFillCreditsRemaining: 30,
      totalQuickFillUsed: 0,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      acceptedTermsAt: new Date(),
    } as any,
    update: {
      password: hashed,
      subscriptionStatus: "TRIAL",
      creditsRemaining: 30,
      quickFillCreditsRemaining: 30,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as any,
  });
  console.log(`  user.id = ${user.id}`);

  let org = await prisma.organization.findFirst({
    where: { ownerId: user.id, name: ORG_NAME },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: ORG_NAME, ownerId: user.id },
      select: { id: true },
    });
  }
  if (user.organizationId !== org.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });
  }
  console.log(`  org.id = ${org.id}`);

  const sampleInspections = [
    {
      inspectionNumber: `NIR-2026-04-RVW1`,
      propertyAddress: "12 Sample Street, Brisbane City",
      propertyPostcode: "4000",
      technicianName: "Demo Technician",
      status: "DRAFT" as const,
    },
    {
      inspectionNumber: `NIR-2026-04-RVW2`,
      propertyAddress: "47 Demo Avenue, Toowong",
      propertyPostcode: "4066",
      technicianName: "Demo Technician",
      status: "SUBMITTED" as const,
    },
  ];

  for (const ins of sampleInspections) {
    await prisma.inspection.upsert({
      where: { inspectionNumber: ins.inspectionNumber },
      create: {
        ...ins,
        userId: user.id,
        inspectionDate: new Date(),
      },
      update: {
        propertyAddress: ins.propertyAddress,
        status: ins.status,
      },
    });
  }
  console.log(`  seeded ${sampleInspections.length} sample inspection(s)`);

  console.log(
    "\n=== Paste these into App Store Connect → Sign-In Information ===",
  );
  console.log(`  Username: ${REVIEWER_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log(
    "\nVerify by signing in at https://restoreassist.app/login before pasting into App Store Connect.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
