/**
 * RA-7721 — give one Founding Trial business every technician seat and every
 * add-on, uncharged (founder ruling 27/09/2026).
 *
 * Dry run by default; nothing is written without --apply:
 *   DATABASE_URL=... npx tsx scripts/grant-founding-trial.ts <organizationId>
 *   DATABASE_URL=... npx tsx scripts/grant-founding-trial.ts <organizationId> --apply
 *
 * Or: npm run script:grant-founding-trial -- <organizationId> [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  FoundingTrialGrantError,
  grantFoundingTrial,
} from "../lib/billing/founding-trial-grant";

// Prisma 7 needs the pg driver adapter at construction; a bare
// `new PrismaClient()` throws before the first query (RA-7576).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

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

async function main() {
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
