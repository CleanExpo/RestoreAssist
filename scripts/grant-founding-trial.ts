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
 * It asks Stripe (read-only), across the whole account, for add-on billing
 * stamped with this business's workspace, before writing and again five
 * minutes after. Any add-on checkout still open, or any live add-on
 * subscription the database does not know about yet, would leave the
 * business paying for something now free: before writing, the script refuses;
 * after, it puts the grant back as it was. Either way it names what it found.
 * It never expires, cancels or refunds anything in Stripe.
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { STRIPE_API_VERSION } from "../lib/stripe";
import {
  FoundingTrialGrantError,
  runFoundingTrialGrant,
  type BillingConflict,
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
const stripe = new Stripe(stripeKey, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

function listConflicts(conflicts: BillingConflict[]) {
  for (const c of conflicts) {
    const what = c.kind === "open_checkout" ? "open checkout" : "live subscription";
    console.error(`  ${what} ${c.id}  customer=${c.customer}  ${c.sku ?? "(no sku)"}`);
  }
}

async function main() {
  const out = await runFoundingTrialGrant({
    db: prisma,
    stripe,
    organizationId: organizationId!,
    apply,
  });
  if (out.status === "refused") {
    console.error(
      "REFUSED, nothing written: this business has add-on billing in Stripe that " +
        "the grant would clash with. Once each checkout has expired or been " +
        "abandoned, and each subscription is resolved by the owner, run this again:",
    );
    listConflicts(out.conflicts);
    process.exit(3);
  }
  if (out.status === "reverted") {
    console.error(
      "REVERTED: an add-on checkout or subscription appeared while the grant was " +
        "being applied, so the grant has been put back as it was. Resolve these, " +
        "then run this again:",
    );
    listConflicts(out.conflicts);
    process.exit(4);
  }
  const res = out.result;
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
