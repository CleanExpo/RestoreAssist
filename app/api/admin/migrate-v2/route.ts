/**
 * POST /api/admin/migrate-v2
 * One-time endpoint to create V2 tables on DO managed database.
 * Requires CRON_SECRET bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { prisma } from "@/lib/prisma";

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "AscoraIntegration" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "userId" TEXT NOT NULL UNIQUE, "apiKey" TEXT NOT NULL, "baseUrl" TEXT NOT NULL DEFAULT 'https://api.ascora.com.au', "isActive" BOOLEAN NOT NULL DEFAULT true, "lastSyncAt" TIMESTAMP(3), "totalJobsImported" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "AscoraJob" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "integrationId" TEXT NOT NULL, "ascoraJobId" TEXT NOT NULL UNIQUE, "ascoraJobNumber" TEXT, "jobType" TEXT, "claimType" TEXT, "suburb" TEXT, "state" TEXT, "postcode" TEXT, "completedAt" TIMESTAMP(3), "sentToMyob" BOOLEAN NOT NULL DEFAULT false, "totalExTax" DOUBLE PRECISION, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AscoraIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "AscoraJob_integrationId_idx" ON "AscoraJob"("integrationId")`,
  `CREATE INDEX IF NOT EXISTS "AscoraJob_claimType_idx" ON "AscoraJob"("claimType")`,
  `CREATE INDEX IF NOT EXISTS "AscoraJob_completedAt_idx" ON "AscoraJob"("completedAt")`,
  `CREATE TABLE IF NOT EXISTS "AscoraLineItem" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "ascoraJobId" TEXT NOT NULL, "partNumber" TEXT NOT NULL, "description" TEXT NOT NULL, "quantity" DOUBLE PRECISION NOT NULL, "unitPriceExTax" DOUBLE PRECISION NOT NULL, "amountExTax" DOUBLE PRECISION NOT NULL, "invoiceDate" TIMESTAMP(3), "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraLineItem_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "AscoraLineItem_ascoraJobId_idx" ON "AscoraLineItem"("ascoraJobId")`,
  `CREATE TABLE IF NOT EXISTS "AscoraNote" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "ascoraJobId" TEXT NOT NULL, "noteText" TEXT NOT NULL, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraNote_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "ScopePricingDatabase" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "partNumber" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "claimTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "usageCount" INTEGER NOT NULL DEFAULT 0, "averageUnitPriceAU" DOUBLE PRECISION NOT NULL, "medianUnitPriceAU" DOUBLE PRECISION, "minPriceAU" DOUBLE PRECISION, "maxPriceAU" DOUBLE PRECISION, "averageQuantity" DOUBLE PRECISION, "acceptanceRate" DOUBLE PRECISION, "acceptedCount" INTEGER NOT NULL DEFAULT 0, "rejectedCount" INTEGER NOT NULL DEFAULT 0, "priceHistory" JSONB, "source" TEXT NOT NULL DEFAULT 'ascora', "isActive" BOOLEAN NOT NULL DEFAULT true, "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "HistoricalJob" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "source" TEXT NOT NULL, "externalId" TEXT NOT NULL, "jobNumber" TEXT NOT NULL, "jobName" TEXT NOT NULL, "description" TEXT NOT NULL, "claimType" TEXT NOT NULL, "waterCategory" TEXT, "waterClass" TEXT, "address" TEXT, "suburb" TEXT NOT NULL, "state" TEXT NOT NULL, "postcode" TEXT NOT NULL, "customerName" TEXT, "totalExTax" DOUBLE PRECISION NOT NULL DEFAULT 0, "totalIncTax" DOUBLE PRECISION NOT NULL DEFAULT 0, "completedDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HistoricalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId")`,
];

export async function POST(request: NextRequest) {
  // RA-1283: defence-in-depth. CRON_SECRET gates access but this endpoint
  // re-runs DDL on prod — a mis-triggered curl could thrash the DB. Require
  // an explicit env flag to be set for each invocation; the owner can set
  // it before running the migration and remove it immediately after. This
  // means even a leaked CRON_SECRET can't trigger schema ops without a
  // second factor. DDL is already idempotent (`CREATE … IF NOT EXISTS`)
  // but the flag additionally logs an audit line with who gated it.
  if (process.env.ADMIN_MIGRATE_V2_ENABLED !== "true") {
    console.warn(
      "[admin/migrate-v2] Rejected: ADMIN_MIGRATE_V2_ENABLED not set. Set to 'true' in env, run, then unset.",
    );
    return NextResponse.json(
      {
        error:
          "Endpoint disabled. Set ADMIN_MIGRATE_V2_ENABLED=true in env to enable, run migration, then unset.",
      },
      { status: 403 },
    );
  }

  const cronErr = verifyCronAuth(request);
  if (cronErr) return cronErr;

  // RA-1334 — advisory lock guards against concurrent invocations that
  // would deadlock Postgres on the CREATE TABLE / CREATE INDEX DDL
  // against the same relations. If another instance holds the lock,
  // return 409 early rather than piling on schema locks. Lock key
  // is a deterministic constant for this migration (RA-1334 ticket
  // number mapped to int4).
  const LOCK_KEY = 1334; // Int4 advisory lock key for admin/migrate-v2
  const [{ locked }] = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`,
  );
  if (!locked) {
    console.warn(
      `[admin/migrate-v2] Another instance holds advisory lock ${LOCK_KEY} — migration already in flight.`,
    );
    return NextResponse.json(
      { error: "Migration already in flight. Retry after it completes." },
      { status: 409 },
    );
  }

  const results: string[] = [];
  try {
    for (const stmt of DDL_STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        results.push("OK");
      } catch (err: any) {
        results.push(`ERROR: ${err?.message?.slice(0, 100)}`);
      }
    }

    // Verify
    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('AscoraIntegration','AscoraJob','AscoraLineItem','AscoraNote','ScopePricingDatabase','HistoricalJob')`,
    );

    return NextResponse.json({ results, tables });
  } finally {
    // Always release the lock — even if DDL threw partway through.
    await prisma
      .$executeRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_KEY})`)
      .catch((err) => {
        console.error(
          `[admin/migrate-v2] Failed to release advisory lock ${LOCK_KEY}:`,
          err,
        );
      });
  }
}
