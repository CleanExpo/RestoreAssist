/**
 * One-shot script: provision the Google Play Store reviewer account.
 *
 * Creates (or upserts), all idempotently:
 *   - User: playstore-review@restoreassist.app, USER role, TRIAL plan
 *   - Organization: "Play Store Demo Co"
 *   - Authorisation: IICRC-DEMO + WHS-DEMO (so the modal-first sign-off
 *     flow lands directly on the unlocked form)
 *   - Client: "Demo Insurance Co"
 *   - Inspection: NIR-2026-05-PLAY1 (status SUBMITTED, 12 photos, 4 readings)
 *   - Invoice: RA-PLAY-0001 (status DRAFT, $880 incl. GST)
 *
 * Run against PROD before submitting the Play Store build:
 *   DATABASE_URL=$DATABASE_URL_PROD npx tsx scripts/seed-playstore-test-account.ts
 *
 * The script PRINTS the email + freshly generated password at the end.
 * Capture both, store in 1Password, paste into Play Console → App access.
 *
 * Idempotent: re-running rotates the password but keeps the user + org + data
 * intact (same row ids across runs, so deep-links remain stable).
 *
 * Linear: RA-3015 (Android Play Store launch).
 * Pairs with: docs/play-store-test-account.md.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const REVIEWER_EMAIL = "playstore-review@restoreassist.app";
const ORG_NAME = "Play Store Demo Co";
const CLIENT_NAME = "Demo Insurance Co";
const INSPECTION_NUMBER = "NIR-2026-05-PLAY1";
const INVOICE_NUMBER = "RA-PLAY-0001";

// Mirrors scripts/provision-reviewer-account.ts — passes the >=12 char floor
// in app/api/auth/register/route.ts and the HIBP check.
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

async function main() {
  console.log("=== Provisioning Play Store reviewer account ===");

  // ── 1. User ────────────────────────────────────────────────────────────────
  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    create: {
      email: REVIEWER_EMAIL,
      name: "Play Store Reviewer",
      password: hashed,
      role: "USER",
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

  // ── 2. Organization ────────────────────────────────────────────────────────
  let org = await prisma.organization.findFirst({
    where: { ownerId: user.id, name: ORG_NAME },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: ORG_NAME,
        ownerId: user.id,
        legalName: "Play Store Demo Co Pty Ltd",
        tradingName: ORG_NAME,
        state: "QLD",
        address: "12 Sample Street, Brisbane City QLD 4000",
        phone: "+61 7 0000 0000",
        email: "ops@playstore-demo.example",
        setupCompletedAt: new Date(),
      },
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

  // ── 3. Authorisation (pre-seeded so the licence banner is dismissed) ───────
  const existingAuth = await prisma.authorisation.findFirst({
    where: { userId: user.id, subjectUserId: user.id },
    select: { id: true },
  });
  if (!existingAuth) {
    await prisma.authorisation.create({
      data: {
        userId: user.id,
        subjectUserId: user.id,
        subjectCompanyName: ORG_NAME,
        subjectLicenceNumber: "IICRC-DEMO",
        subjectLicenceState: "QLD",
        subjectLicenceClass: "Restoration",
        whsCardNumber: "WHS-DEMO",
        whsCardExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        verifiedAt: new Date(),
        verifiedMethod: "DOCUMENT_UPLOAD",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "VALID",
        notes: "Pre-seeded for Play Store reviewer account (see RA-3015).",
      },
    });
    console.log("  authorisation seeded");
  } else {
    console.log(`  authorisation already present (id=${existingAuth.id})`);
  }

  // ── 4. Client ──────────────────────────────────────────────────────────────
  const client = await prisma.client.upsert({
    where: { userId_email: { userId: user.id, email: "claims@demo-insurance.example" } },
    create: {
      userId: user.id,
      name: CLIENT_NAME,
      email: "claims@demo-insurance.example",
      phone: "+61 7 0000 0001",
      address: "1 Insurer Plaza, Sydney NSW 2000",
      company: CLIENT_NAME,
      contactPerson: "Demo Claims Officer",
      status: "ACTIVE",
      isSample: true,
    },
    update: { name: CLIENT_NAME, status: "ACTIVE", isSample: true },
  });
  console.log(`  client.id = ${client.id}`);

  // ── 5. Inspection ──────────────────────────────────────────────────────────
  const inspection = await prisma.inspection.upsert({
    where: { inspectionNumber: INSPECTION_NUMBER },
    create: {
      inspectionNumber: INSPECTION_NUMBER,
      propertyAddress: "12 Sample Street, Brisbane City",
      propertyPostcode: "4000",
      technicianName: "Demo Technician",
      status: "SUBMITTED",
      inspectionDate: new Date(),
      submittedAt: new Date(),
      userId: user.id,
      lossDescription:
        "Demo CAT 2 water-damage scenario for Play Store reviewer.",
    },
    update: {
      status: "SUBMITTED",
      propertyAddress: "12 Sample Street, Brisbane City",
      propertyPostcode: "4000",
    },
  });
  console.log(`  inspection.id = ${inspection.id}`);

  // ── 6. 12 photos (idempotent by description; safe to re-run) ───────────────
  const PLACEHOLDER_PHOTO_URL =
    "https://res.cloudinary.com/restoreassist/image/upload/v1/demo/playstore-placeholder.jpg";

  await prisma.inspectionPhoto.deleteMany({
    where: { inspectionId: inspection.id },
  });
  for (let i = 0; i < 12; i++) {
    await prisma.inspectionPhoto.create({
      data: {
        inspectionId: inspection.id,
        url: PLACEHOLDER_PHOTO_URL,
        thumbnailUrl: PLACEHOLDER_PHOTO_URL,
        location: i < 6 ? "Living Room" : "Kitchen",
        description: `Demo photo ${i + 1} of 12 — for Play Store reviewer.`,
        fileSize: 245678,
        mimeType: "image/jpeg",
        gpsLatitude: -27.4698,
        gpsLongitude: 153.0251,
      },
    });
  }
  console.log("  seeded 12 inspection photos");

  // ── 7. 4 moisture readings ─────────────────────────────────────────────────
  await prisma.moistureReading.deleteMany({
    where: { inspectionId: inspection.id },
  });
  const readings = [
    { location: "Living Room - Wall A", surfaceType: "drywall", moistureLevel: 32.5, depth: "Surface", isBaseline: false },
    { location: "Living Room - Floor", surfaceType: "carpet", moistureLevel: 45.8, depth: "Surface", isBaseline: false },
    { location: "Kitchen - Wall B", surfaceType: "drywall", moistureLevel: 18.2, depth: "Surface", isBaseline: false },
    { location: "Hallway - Reference", surfaceType: "drywall", moistureLevel: 8.4, depth: "Surface", isBaseline: true },
  ];
  for (const r of readings) {
    await prisma.moistureReading.create({
      data: {
        inspectionId: inspection.id,
        location: r.location,
        surfaceType: r.surfaceType,
        moistureLevel: r.moistureLevel,
        depth: r.depth,
        unit: "PERCENT_MC",
        deviceVendor: "Delmhorst",
        deviceModel: "Navigator Pro",
        source: "manual",
        isBaseline: r.isBaseline,
      } as any,
    });
  }
  console.log("  seeded 4 moisture readings");

  // ── 8. Invoice (DRAFT, $880 incl. GST) ─────────────────────────────────────
  await prisma.invoice.upsert({
    where: { invoiceNumber: INVOICE_NUMBER },
    create: {
      invoiceNumber: INVOICE_NUMBER,
      status: "DRAFT",
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      customerName: CLIENT_NAME,
      customerEmail: "claims@demo-insurance.example",
      customerPhone: "+61 7 0000 0001",
      customerAddress: "1 Insurer Plaza, Sydney NSW 2000",
      subtotalExGST: 80000, // $800.00
      gstAmount: 8000, // $80.00 (10% GST)
      totalIncGST: 88000, // $880.00
      amountPaid: 0,
      amountDue: 88000,
      currency: "AUD",
      userId: user.id,
      clientId: client.id,
      notes: "Demo invoice for Play Store reviewer.",
    },
    update: { status: "DRAFT", amountDue: 88000 },
  });
  console.log(`  invoice ${INVOICE_NUMBER} (DRAFT, $880.00 incl. GST)`);

  console.log(
    "\n=== Paste these into Play Console → App content → App access ===",
  );
  console.log(`  Email:    ${REVIEWER_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log("\nVerify by signing in at https://restoreassist.app/login");
  console.log("before pasting into Play Console.");
  console.log(
    "\nAlso store this password in 1Password (vault: 'RestoreAssist Production',",
  );
  console.log("item: 'Play Store reviewer credentials').");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
