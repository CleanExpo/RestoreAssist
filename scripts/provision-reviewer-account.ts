/**
 * One-shot script: provision the Apple App Store reviewer account.
 *
 * Creates (or upserts):
 *   - User: reviewer@restoreassist.app, ADMIN role, TRIAL with 30 credits + 30 quickFill
 *   - Organisation: "Apple Reviewer Workspace"
 *   - 2 sample inspections with fake AU addresses (no real customer PII)
 *
 * Run against PROD (the Capacitor WebView talks to https://restoreassist.app):
 *   DATABASE_URL=$DATABASE_URL_PROD npx tsx scripts/provision-reviewer-account.ts
 *
 * The script PRINTS the email + freshly generated password at the end.
 * Capture both — they're what you paste into App Store Connect → Sign-In Information.
 *
 * Idempotent: re-running rotates the password but keeps the user + org + inspections.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const ORG_NAME = "Apple Reviewer Workspace";

// Generates a strong 20-char password mixing alpha + digits + symbol — passes
// the >= 12 char floor in app/api/auth/register/route.ts:87 and the HIBP check.
function generatePassword(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = alpha + digits + symbols;
  const bytes = crypto.randomBytes(20);
  let out = "";
  // Force at least one char from each pool to satisfy any future complexity rules
  out += alpha[bytes[0] % alpha.length];
  out += alpha[bytes[1] % alpha.length].toUpperCase();
  out += digits[bytes[2] % digits.length];
  out += symbols[bytes[3] % symbols.length];
  for (let i = 4; i < 20; i++) {
    out += all[bytes[i] % all.length];
  }
  return out;
}

async function main() {
  console.log("=== Provisioning App Store reviewer account ===");

  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 12);

  // Upsert user — keep id stable, rotate password, ensure TRIAL + credits
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
      // Ensure trial is healthy on every re-run
      subscriptionStatus: "TRIAL",
      creditsRemaining: 30,
      quickFillCreditsRemaining: 30,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as any,
  });
  console.log(`  user.id = ${user.id}`);

  // Upsert organisation owned by reviewer
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

  // Seed 2 sample inspections with fake AU addresses
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
        // Keep the same row id stable across re-runs
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
