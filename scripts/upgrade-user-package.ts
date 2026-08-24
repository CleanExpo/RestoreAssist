/**
 * Manually subscribe an existing user to the $99 Monthly Plan and grant
 * every recurring add-on on their workspace.
 *
 * This is the ops path for `npm run script:upgrade-user -- user@example.com`.
 * It does NOT create a Stripe charge — it stamps local fields so:
 *   - /dashboard/subscription shows Current Plan = Monthly Plan @ $99 AUD
 *     (ACTIVE, not free trial / "No Active Subscription")
 *   - /api/addons/catalog lists every registry SKU as owned
 *   - paywall / trial gates treat the account as paid (ACTIVE + lifetimeAccess)
 *
 * Sets on the User row (matching Stripe fulfillment naming):
 *   - subscriptionStatus = ACTIVE
 *   - subscriptionPlan = "Monthly Plan" (PRICING_CONFIG.pricing.monthly.name)
 *   - lastBillingDate / nextBillingDate / subscriptionEndsAt = current month
 *   - lifetimeAccess = true (no trial expiry / hard paywall)
 *   - report + Quick Fill credits from the Monthly Plan allowance
 *   - signup bonus reports (once), matching Stripe fulfillment
 *
 * Sets on their Workspace (same resolver as /api/addons/catalog):
 *   - FeatureEntitlement active=true for every AddonSku in ADDON_SKUS
 *   - TECHNICIAN_SEATS gets seats=10 (quantity-based SKU)
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   npm run script:upgrade-user -- user@example.com
 *   npx tsx scripts/upgrade-user-package.ts user@example.com
 *
 * Loads DATABASE_URL from .env.production.local / .env.local / .env.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ADDON_SKUS } from "../lib/entitlements/types";
import {
  MONTHLY_PLAN_NAME,
  PRICING_CONFIG,
  resolveLocalSubscriptionPlanDisplay,
} from "../lib/pricing";

for (const f of [".env.production.local", ".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

/** Default seat count for the quantity-based TECHNICIAN_SEATS add-on. */
const DEFAULT_TECHNICIAN_SEATS = 10;

function parseEmail(argv: string[]): string {
  const email = (argv[2] ?? process.env.UPGRADE_USER_EMAIL ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    console.error(
      "Usage: npm run script:upgrade-user -- user@example.com\n" +
        "   or: UPGRADE_USER_EMAIL=user@example.com npm run script:upgrade-user",
    );
    process.exit(1);
  }
  return email;
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to upgrade a user package");
  }
  return new PrismaClient({
    adapter: new PrismaPg(
      new Pool({
        connectionString,
        max: 2,
        ssl:
          connectionString.includes("supabase") ||
          connectionString.includes("sslmode=require")
            ? { rejectUnauthorized: false }
            : undefined,
      }),
    ),
  });
}

/** Current calendar month window for Subscription page period dates. */
function monthlyBillingWindow(now = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(now);
  const periodEnd = new Date(now);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  return { periodStart, periodEnd };
}

async function ensureWorkspace(
  prisma: PrismaClient,
  userId: string,
  email: string,
) {
  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { id: true, status: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (!workspace) {
    const slugBase =
      email
        .split("@")[0]
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 40) || "upgraded-user";
    let slug = slugBase;
    let n = 0;
    while (await prisma.workspace.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${slugBase}-${n}`;
    }
    workspace = await prisma.workspace.create({
      data: {
        name: "Upgraded Workspace",
        slug,
        ownerId: userId,
        status: "READY",
      },
      select: { id: true, status: true, name: true },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    console.log(`  Created workspace ${workspace.id} (${slug})`);
  } else if (workspace.status !== "READY") {
    workspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { status: "READY" },
      select: { id: true, status: true, name: true },
    });
    console.log(`  Workspace ${workspace.id} set to READY`);
  }

  return workspace;
}

async function grantAllAddons(prisma: PrismaClient, workspaceId: string) {
  const granted: string[] = [];
  for (const sku of ADDON_SKUS) {
    const seats = sku === "TECHNICIAN_SEATS" ? DEFAULT_TECHNICIAN_SEATS : null;
    await prisma.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId, sku } },
      create: {
        workspaceId,
        sku,
        active: true,
        ...(seats != null ? { seats } : {}),
      },
      update: {
        active: true,
        ...(seats != null ? { seats } : {}),
      },
    });
    granted.push(seats != null ? `${sku} (seats=${seats})` : sku);
  }
  return granted;
}

async function verifyUpgrade(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      lifetimeAccess: true,
      lastBillingDate: true,
      nextBillingDate: true,
      subscriptionEndsAt: true,
      creditsRemaining: true,
    },
  });

  const entitlements = await prisma.featureEntitlement.findMany({
    where: { workspaceId, active: true, sku: { in: [...ADDON_SKUS] } },
    select: { sku: true, active: true, seats: true },
    take: 50,
  });

  const display = resolveLocalSubscriptionPlanDisplay(user?.subscriptionPlan);
  const problems: string[] = [];

  if (user?.subscriptionStatus !== "ACTIVE") {
    problems.push(`subscriptionStatus=${user?.subscriptionStatus} (want ACTIVE)`);
  }
  if (user?.subscriptionPlan !== MONTHLY_PLAN_NAME) {
    problems.push(
      `subscriptionPlan=${user?.subscriptionPlan} (want ${MONTHLY_PLAN_NAME})`,
    );
  }
  if (!user?.lifetimeAccess) {
    problems.push("lifetimeAccess is not true");
  }
  if (!user?.lastBillingDate || !user?.nextBillingDate) {
    problems.push("billing period dates missing");
  }
  if (display.amountCents !== Math.round(PRICING_CONFIG.pricing.monthly.amount * 100)) {
    problems.push(
      `display amount ${display.amountCents}¢ ≠ $${PRICING_CONFIG.pricing.monthly.amount}`,
    );
  }
  if (entitlements.length !== ADDON_SKUS.length) {
    problems.push(
      `active add-ons ${entitlements.length}/${ADDON_SKUS.length}`,
    );
  }

  return { user, display, entitlements, problems };
}

async function main() {
  const email = parseEmail(process.argv);
  const prisma = createPrisma();
  const monthly = PRICING_CONFIG.pricing.monthly;

  try {
    console.log(
      `=== Upgrade to ${MONTHLY_PLAN_NAME} ($${monthly.amount} ${monthly.currency}/${monthly.interval}) + all add-ons ===`,
    );
    console.log(`Email: ${email}`);

    const before = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        lifetimeAccess: true,
        creditsRemaining: true,
        quickFillCreditsRemaining: true,
        addonReports: true,
        signupBonusApplied: true,
        organizationId: true,
        lastBillingDate: true,
        nextBillingDate: true,
      },
    });

    if (!before) {
      console.error(`User not found for email: ${email}`);
      process.exitCode = 1;
      return;
    }

    console.log("Before:");
    console.log(" ", JSON.stringify(before));

    const signupBonus = monthly.signupBonus;
    const reportAllowance = monthly.reportLimit + signupBonus;
    const { periodStart, periodEnd } = monthlyBillingWindow();

    const after = await prisma.user.update({
      where: { id: before.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: MONTHLY_PLAN_NAME,
        lifetimeAccess: true,
        lastBillingDate: periodStart,
        nextBillingDate: periodEnd,
        subscriptionEndsAt: periodEnd,
        // Clear trial-only framing so the Subscription page treats this as paid.
        creditsRemaining: Math.max(
          before.creditsRemaining ?? 0,
          reportAllowance,
        ),
        quickFillCreditsRemaining: Math.max(
          before.quickFillCreditsRemaining ?? 0,
          999,
        ),
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        monthlyResetDate: periodStart,
        ...(before.signupBonusApplied
          ? {}
          : {
              addonReports: { increment: signupBonus },
              signupBonusApplied: true,
            }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        lifetimeAccess: true,
        creditsRemaining: true,
        quickFillCreditsRemaining: true,
        addonReports: true,
        signupBonusApplied: true,
        lastBillingDate: true,
        nextBillingDate: true,
        subscriptionEndsAt: true,
      },
    });

    console.log("After user update:");
    console.log(" ", JSON.stringify(after));

    const workspace = await ensureWorkspace(prisma, before.id, email);
    const addons = await grantAllAddons(prisma, workspace.id);

    console.log(`\nWorkspace: ${workspace.id} (${workspace.name})`);
    console.log(`Add-ons active (${addons.length}/${ADDON_SKUS.length}):`);
    for (const a of addons) console.log(`  - ${a}`);

    const verify = await verifyUpgrade(prisma, before.id, workspace.id);
    const display = verify.display;
    console.log("\nSubscription page should show:");
    console.log(
      `  Plan: ${display.name} · $${(display.amountCents / 100).toFixed(2)} ${display.currency.toUpperCase()}/${display.interval}`,
    );
    console.log(`  Status: ACTIVE`);
    console.log(`  Add-ons owned: ${verify.entitlements.length}/${ADDON_SKUS.length}`);

    if (verify.problems.length > 0) {
      console.error("\n✗ Verification failed:");
      for (const p of verify.problems) console.error(`  - ${p}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      "\n✓ Done. Ask the user to sign out and back in so the session JWT refreshes.",
    );
    console.log(
      "  Note: Update Payment Method still needs a Stripe customer (real checkout).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[upgrade-user-package] failed:", err);
  process.exitCode = 1;
});
