/**
 * GET|POST /api/cron/sync-ascora-labour — RA-7026
 *
 * Batched importer for per-job chargeable labour. Ascora only exposes labour
 * via GET /Jobs/JobLabour/{jobNumber} — one call per job, ~4,000 jobs — far
 * beyond one invocation, so an hourly cron drains jobs where
 * `labourSyncedAt IS NULL` in batches (default 200/run; the backlog clears in
 * ~20 runs, after which each run is a cheap no-op that picks up new jobs).
 *
 * Each chargeable labour entry becomes an AscoraLineItem with a synthetic
 * `LABOUR-<ROLE>` part number and flows into ScopePricingDatabase via the
 * historical importer's own aggregation (no uplift — these are the rates the
 * business actually charged). Zero-labour jobs still advance the cursor;
 * fetch failures do not, so those jobs retry on the next run.
 *
 * Auth: CRON_SECRET bearer via verifyCronAuth. A missing integration is a
 * soft no-op, not an error — this cron predates the first historical sync in
 * vercel.json and must not page anyone until data exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { decrypt } from "@/lib/credential-vault";
import { isEncryptedToken } from "@/lib/auth/account-tokens";
import { fetchAscoraWithRetry } from "@/lib/integrations/ascora/fetch-with-retry";
import { aggregateIntoPricingDb } from "@/app/api/ascora/sync/route";

export const maxDuration = 800;

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

interface AscoraJobLabourRaw {
  roleName?: string;
  numberOfHours?: number;
  hourlyRateExTax?: number;
  totalAmountExTax?: number;
  isChargeable?: boolean;
  startDate?: string | null;
}

/** "Senior Technician" → "LABOUR-SENIOR-TECHNICIAN" */
function labourPartNumber(roleName?: string): string {
  const slug = (roleName ?? "GENERAL")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `LABOUR-${slug || "GENERAL"}`;
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(
    MAX_BATCH,
    Math.max(1, parseInt(searchParams.get("batch") ?? "", 10) || DEFAULT_BATCH),
  );

  const jobResult = await runCronJob("sync-ascora-labour", async () => {
    const integration = await (prisma as any).ascoraIntegration.findFirst({
      where: { isActive: true },
    });
    if (!integration) {
      return {
        itemsProcessed: 0,
        metadata: { reason: "No active Ascora integration yet" },
      };
    }

    const apiKey = isEncryptedToken(integration.apiKey)
      ? decrypt(integration.apiKey)
      : integration.apiKey;
    const baseUrl = (integration.baseUrl ?? "https://api.ascora.com.au").replace(
      /\/$/,
      "",
    );

    const jobs = await (prisma as any).ascoraJob.findMany({
      where: { labourSyncedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ascoraJobId: true,
        ascoraJobNumber: true,
        claimType: true,
      },
      take: batchSize,
    });

    let jobsProcessed = 0;
    let labourLines = 0;
    let fetchErrors = 0;
    const pricingLines: Array<{
      jobId: string;
      partNumber: string;
      description: string;
      quantity: number;
      unitPriceExTax: number;
      amountExTax: number;
      invoiceDate: string | null;
    }> = [];
    const claimTypeMap = new Map<string, string | null>();

    for (const job of jobs) {
      claimTypeMap.set(job.ascoraJobId, job.claimType ?? null);

      // No job number → nothing to fetch against; advance the cursor so the
      // batch never wedges on unfetchable rows.
      if (!job.ascoraJobNumber?.trim()) {
        await (prisma as any).ascoraJob.update({
          where: { id: job.id },
          data: { labourSyncedAt: new Date() },
        });
        jobsProcessed++;
        continue;
      }

      let labours: AscoraJobLabourRaw[];
      try {
        const res = await fetchAscoraWithRetry(
          `${baseUrl}/Jobs/JobLabour/${encodeURIComponent(job.ascoraJobNumber.trim())}`,
          { headers: { Auth: apiKey, "Content-Type": "application/json" } },
          { timeoutMs: 15000, context: `JobLabour ${job.ascoraJobNumber}` },
        );
        const data = await res.json();
        labours = Array.isArray(data?.jobLabours) ? data.jobLabours : [];
      } catch {
        // Leave labourSyncedAt null — this job retries on the next run.
        fetchErrors++;
        continue;
      }

      const billable = labours.filter(
        (l) => (l.hourlyRateExTax ?? 0) > 0 && (l.numberOfHours ?? 0) > 0,
      );

      // Idempotent re-sync: replace this job's labour lines wholesale.
      await (prisma as any).ascoraLineItem.deleteMany({
        where: { ascoraJobId: job.id, partNumber: { startsWith: "LABOUR-" } },
      });

      for (const labour of billable) {
        const partNumber = labourPartNumber(labour.roleName);
        const quantity = labour.numberOfHours!;
        const unitPriceExTax = labour.hourlyRateExTax!;
        const amountExTax =
          labour.totalAmountExTax ?? quantity * unitPriceExTax;
        const description = `${labour.roleName ?? "Labour"}${
          labour.isChargeable === false ? " (non-chargeable)" : ""
        }`;

        await (prisma as any).ascoraLineItem.create({
          data: {
            ascoraJobId: job.id,
            partNumber,
            description,
            quantity,
            unitPriceExTax,
            amountExTax,
            invoiceDate: labour.startDate ? new Date(labour.startDate) : null,
          },
        });
        labourLines++;

        pricingLines.push({
          jobId: job.ascoraJobId,
          partNumber,
          description,
          quantity,
          unitPriceExTax,
          amountExTax,
          invoiceDate: labour.startDate ?? null,
        });
      }

      await (prisma as any).ascoraJob.update({
        where: { id: job.id },
        data: { labourSyncedAt: new Date() },
      });
      jobsProcessed++;
    }

    // Labour rates are the business's own charged rates — uplift ×1.0.
    let pricingPartsUpserted = 0;
    if (pricingLines.length > 0) {
      pricingPartsUpserted = await aggregateIntoPricingDb(
        pricingLines,
        1.0,
        claimTypeMap,
      );
    }

    const remaining = await (prisma as any).ascoraJob.count({
      where: { labourSyncedAt: null },
    });

    return {
      itemsProcessed: jobsProcessed,
      metadata: {
        batchSize,
        labourLines,
        pricingPartsUpserted,
        fetchErrors,
        remaining,
      },
    };
  });

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

/** Manual trigger — same auth, useful for testing and backfill pushes. */
export async function POST(request: NextRequest) {
  return GET(request);
}
