/**
 * Manually upgrade an existing user to the paid package and grant every
 * recurring add-on on their workspace.
 *
 * Sets on the User row:
 *   - subscriptionStatus = ACTIVE
 *   - lifetimeAccess = true (no trial / paywall expiry)
 *   - report + Quick Fill credits high enough for normal use
 *   - signup bonus reports (once), matching Stripe fulfillment
 *
 * Sets on their Workspace:
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
import { PRICING_CONFIG } from "../lib/pricing";

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

async function main() {
  const email = parseEmail(process.argv);
  const prisma = createPrisma();

  try {
    console.log(`=== Upgrade package + all add-ons for ${email} ===`);

    const before = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        subscriptionStatus: true,
        lifetimeAccess: true,
        creditsRemaining: true,
        quickFillCreditsRemaining: true,
        addonReports: true,
        signupBonusApplied: true,
        organizationId: true,
      },
    });

    if (!before) {
      console.error(`User not found for email: ${email}`);
      process.exitCode = 1;
      return;
    }

    console.log("Before:");
    console.log(" ", JSON.stringify(before));

    const signupBonus = PRICING_CONFIG.pricing.monthly.signupBonus;
    const reportAllowance =
      PRICING_CONFIG.pricing.monthly.reportLimit + signupBonus;

    const after = await prisma.user.update({
      where: { id: before.id },
      data: {
        subscriptionStatus: "ACTIVE",
        lifetimeAccess: true,
        creditsRemaining: Math.max(
          before.creditsRemaining ?? 0,
          reportAllowance,
        ),
        quickFillCreditsRemaining: Math.max(
          before.quickFillCreditsRemaining ?? 0,
          999,
        ),
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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
        lifetimeAccess: true,
        creditsRemaining: true,
        quickFillCreditsRemaining: true,
        addonReports: true,
        signupBonusApplied: true,
      },
    });

    console.log("After user update:");
    console.log(" ", JSON.stringify(after));

    const workspace = await ensureWorkspace(prisma, before.id, email);
    const addons = await grantAllAddons(prisma, workspace.id);

    console.log(`\nWorkspace: ${workspace.id} (${workspace.name})`);
    console.log(`Add-ons active (${addons.length}):`);
    for (const a of addons) console.log(`  - ${a}`);

    console.log(
      "\n✓ Done. Ask the user to sign out and back in so the session JWT refreshes.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[upgrade-user-package] failed:", err);
  process.exitCode = 1;
});
