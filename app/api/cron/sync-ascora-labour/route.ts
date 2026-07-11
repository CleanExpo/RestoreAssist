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

function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/**
 * Ascora does NOT key list rows by an endpoint-named field. Paginated lists
 * wrap rows in `{ success, results: [...] }` (see the /Jobs/Jobs importer that
 * works) and some endpoints (GetInvoicesToSend) return a bare array. The
 * original `data.jobLabours` guess matched none of these, so every JobLabour
 * call succeeded yet parsed to [] — 4,000 jobs, zero labour lines (RA-7026:
 * `fetchErrors:0, labourLines:0`). Extract the row array from whichever shape
 * Ascora actually returns, and normalise each row tolerantly (rate/hours field
 * naming varies across Ascora endpoints).
 */
export function normalizeJobLabours(data: unknown): AscoraJobLabourRaw[] {
  const d = data as Record<string, unknown> | unknown[] | null;
  let rows: unknown[] = [];
  if (Array.isArray(d)) {
    rows = d;
  } else if (d && typeof d === "object") {
    for (const key of [
      "results",
      "jobLabours",
      "jobLabour",
      "JobLabours",
      "labour",
      "labours",
      "items",
    ]) {
      const v = (d as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        rows = v;
        break;
      }
    }
  }

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      roleName: (r.roleName ??
        r.role ??
        r.name ??
        r.labourType ??
        r.description) as string | undefined,
      numberOfHours: toNum(
        r.numberOfHours ?? r.hours ?? r.quantity ?? r.qty ?? r.units,
      ),
      hourlyRateExTax: toNum(
        r.hourlyRateExTax ??
          r.hourlyRate ??
          r.rateExTax ??
          r.rate ??
          r.unitPriceExTax ??
          r.unitPrice,
      ),
      totalAmountExTax: toNum(
        r.totalAmountExTax ?? r.amountExTax ?? r.totalExTax ?? r.total ?? r.amount,
      ),
      isChargeable:
        typeof r.isChargeable === "boolean"
          ? r.isChargeable
          : typeof r.chargeable === "boolean"
            ? (r.chargeable as boolean)
            : undefined,
      startDate: (r.startDate ?? r.date ?? r.workDate ?? null) as
        | string
        | null,
    }));
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
    let shapeSamples = 0;
    const emptyShapes: string[] = [];
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
        labours = normalizeJobLabours(data);
        // Self-diagnostic (RA-7026): a successful response that yields no rows
        // means the shape doesn't match — capture its top-level keys a few
        // times per run so the real Ascora structure surfaces in Vercel logs
        // AND in this run's metadata, without any API key leaving the server.
        if (labours.length === 0 && data && typeof data === "object" && shapeSamples < 3) {
          const shape = Array.isArray(data)
            ? `array[${data.length}]`
            : JSON.stringify(Object.keys(data as Record<string, unknown>));
          emptyShapes.push(shape);
          console.warn(
            `[sync-ascora-labour] no labour parsed for ${job.ascoraJobNumber} — response shape: ${shape}`,
          );
          shapeSamples++;
        }
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
        // Empty when parsing works; if the shape is still wrong these are the
        // real Ascora response keys to map (RA-7026 self-diagnosis).
        emptyShapes: emptyShapes.slice(0, 3),
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
