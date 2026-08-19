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
 * Also ensures a READY workspace and ACTIVE FeatureEntitlement rows for local
 * connect surfaces (SERVICE_CRM → Ascora, BOOKKEEPING → Xero/QB/MYOB, plus
 * other gated add-ons). requireAddon() reads the DB each request — no JWT
 * re-login required after re-seed; a refresh of the failing request is enough.
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

  // Keep the e2e account usable for local login: long trial + credits on every
  // re-seed. Without refreshing trialEndsAt/credits on update, a previously
  // expired local row leaves the user stuck on /billing/upgrade?reason=trial-expired.
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashedPassword,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      trialEndsAt: oneYear,
      creditsRemaining: 999,
      quickFillCreditsRemaining: 999,
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

  // requireAddon() resolves FeatureEntitlement by workspace — Ascora (SERVICE_CRM)
  // and Xero/QB/MYOB (BOOKKEEPING) connect return 402 without these rows. Local /
  // e2e accounts need them without Stripe checkout.
  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    const slugBase = "e2e-test-org";
    let slug = slugBase;
    let n = 0;
    while (await prisma.workspace.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${slugBase}-${n}`;
    }
    workspace = await prisma.workspace.create({
      data: {
        name: "E2E Test Workspace",
        slug,
        ownerId: user.id,
        status: "READY",
      },
      select: { id: true, status: true },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  } else if (workspace.status !== "READY") {
    workspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { status: "READY" },
      select: { id: true, status: true },
    });
  }

  // SKUs that local connect / gated surfaces need without Stripe.
  const localDevAddonSkus = [
    "SERVICE_CRM",
    "BOOKKEEPING",
    "FLOORPLAN_UNDERLAY",
    "VOICE",
    "PAYMENTS",
    "CLIENT_COMMS",
  ] as const;
  for (const sku of localDevAddonSkus) {
    await prisma.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku } },
      create: { workspaceId: workspace.id, sku, active: true },
      update: { active: true },
    });
  }

  console.log(
    `✓ Seeded e2e account ${EMAIL} (user ${user.id}, org ${org.id}, workspace ${workspace.id}, setup complete, add-ons: ${localDevAddonSkus.join(", ")})`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-e2e-user] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
