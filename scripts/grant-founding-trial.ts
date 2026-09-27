/**
 * RA-7721 — give one Founding Trial business every technician seat and every
 * add-on, uncharged (founder ruling 27/09/2026).
 *
 * Dry run by default; nothing is written without --apply:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx scripts/grant-founding-trial.ts <organizationId>
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx scripts/grant-founding-trial.ts <organizationId> --apply
 *
 * Or: npm run script:grant-founding-trial -- <organizationId> [--apply]
 *
 * Before writing, it asks Stripe (read-only) whether the owner has an add-on
 * Checkout still open. One that completed after the grant would start a paid
 * subscription for an add-on the business now holds free, so the script
 * refuses to apply while any are open and names them. It never expires,
 * cancels or refunds anything in Stripe.
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { STRIPE_API_VERSION } from "../lib/stripe";
import {
  FoundingTrialGrantError,
  grantFoundingTrial,
  openAddonCheckouts,
} from "../lib/billing/founding-trial-grant";

// Prisma 7 needs the pg driver adapter at construction; a bare
// `new PrismaClient()` throws before the first query (RA-7576).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
// The open-checkout check is not optional: without Stripe the script cannot
// know whether a paid subscription is about to land on a free grant.
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is required.");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const organizationId = args.find((a) => !a.startsWith("--"));
if (!organizationId) {
  console.error(
    "Usage: npx tsx scripts/grant-founding-trial.ts <organizationId> [--apply]",
  );
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString, max: 2 })),
});
const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId! },
    select: { owner: { select: { stripeCustomerId: true } } },
  });
  const open = await openAddonCheckouts(stripe, org?.owner?.stripeCustomerId);
  if (open.length) {
    console.error(
      "REFUSED: the owner has add-on checkouts still open. If one completed after " +
        "the grant it would start a paid subscription for an add-on that is now free. " +
        "Wait for them to expire or be abandoned, then run this again:",
    );
    for (const s of open) console.error(`  ${s.id}  ${s.sku ?? "(no sku)"}`);
    process.exit(3);
  }

  const res = await prisma.$transaction((tx) =>
    grantFoundingTrial(tx, organizationId!, { apply }),
  );
  console.log(
    `${res.applied ? "GRANTED" : "DRY RUN (nothing written; add --apply)"} ` +
      `workspace=${res.workspaceId}`,
  );
  console.log(`  add-ons on, uncharged: ${res.granted.join(", ") || "none"}`);
  if (res.skippedPaid.length) {
    console.log(
      `  left alone (already paid through Stripe): ${res.skippedPaid.join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e instanceof FoundingTrialGrantError ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
