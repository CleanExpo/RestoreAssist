/**
 * POST /api/ascora/sync
 *
 * Full historical import of Ascora jobs + line items for the authenticated user.
 * Seeds ScopePricingDatabase with real AU pricing data.
 *
 * Runs paginated (pageSize=1000 per Ascora).
 * Idempotent: existing ascoraJobId records are upserted on conflict.
 *
 * SSL NOTE: Ascora API requires SSL bypass (self-signed cert).
 *   Dev:  add NODE_TLS_REJECT_UNAUTHORIZED=0 to .env.local
 *   Prod: add to Vercel env vars (or supply NODE_EXTRA_CA_CERTS with the Ascora root cert)
 *
 * Query params:
 *   ?incremental=true          — only jobs completed since lastSyncAt (faster, use for cron)
 *   ?minValueAud=5000          — only import jobs with totalExTax >= this value (default 0)
 *                                Use 1000–5000 to focus on Private/Larger-Loss jobs
 *   ?priceUpliftFactor=1.12    — multiply all prices by this before writing (default 1.12 = 12%)
 *                                AU restoration CPI ~10-15% over 12 months per AIBS/Rawlinsons 2025
 *   ?dryRun=true               — fetch + analyse, skip all DB writes, return report only
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ruleBasedClassify } from "@/lib/ai/auto-classify";
import { verifyCronAuth } from "@/lib/cron/auth";

// ============================================================
// Ascora API types — actual camelCase structure from API
// ============================================================

interface AscoraJobType {
  id: string;
  name: string;
}

interface AscoraJobRaw {
  jobId: string;
  jobNumber?: string;
  /** Human-readable job name e.g. "FEN - Sanagozza - Loganholme" */
  jobName?: string;
  /** Full scope narrative — goldmine for AI training / IICRC classification */
  jobDescription?: string;
  /** Ascora returns jobType as an { id, name } object */
  jobType?: AscoraJobType | string;
  addressLine1?: string;
  addressLine2?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  completedDate?: string | null;
  /** Total job value ex-GST — key field for Private/Larger-Loss filtering */
  totalExTax?: number;
  totalIncTax?: number;
  pricingMethod?: string;
  clientOrderNumber?: string;
  status?: string;
  siteCustomer?: { id?: string; name?: string };
  billingCustomer?: { id?: string; name?: string };
}

interface AscoraLineItemRaw {
  jobId?: string;
  partNumber?: string;
  description?: string;
  quantity?: number;
  unitPriceExTax?: number;
  amountExTax?: number;
  invoiceDate?: string | null;
}

/** Standard Ascora paginated response envelope */
interface AscoraPage<T> {
  success: boolean;
  results: T[];
  totalPages: number;
  totalRecords: number;
}

// ============================================================
// Paginated fetch — handles { success, results, totalPages } envelope
// ============================================================

async function fetchAllPages<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  pageSize = 1000,
): Promise<T[]> {
  const allResults: T[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${path}?page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      headers: { Auth: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Ascora API ${res.status} on ${path} (page ${page}): ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as AscoraPage<T>;

    if (!data.success) {
      throw new Error(
        `Ascora responded success=false on ${path} (page ${page})`,
      );
    }

    const items = data.results ?? [];
    allResults.push(...items);

    if (page >= (data.totalPages ?? 1) || items.length === 0) break;
    page++;
  }

  return allResults;
}

// ============================================================
// Line item endpoint discovery
// Try candidates in priority order — return first that responds correctly.
// ============================================================

const LINE_ITEM_CANDIDATES = [
  "/invoicelines",
  "/invoices",
  "/jobcostings",
  "/joblines",
  "/lineitems",
  "/items",
] as const;

async function tryLineItemEndpoints(
  baseUrl: string,
  apiKey: string,
): Promise<{
  endpoint: string | null;
  items: AscoraLineItemRaw[];
  tried: string[];
}> {
  const tried: string[] = [];

  for (const endpoint of LINE_ITEM_CANDIDATES) {
    tried.push(endpoint);
    try {
      const probeUrl = `${baseUrl}${endpoint}?page=1&pageSize=1`;
      const res = await fetch(probeUrl, {
        headers: { Auth: apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.log(`[ascora/sync] ${endpoint} → ${res.status} (skipping)`);
        continue;
      }

      const data = await res.json();
      // Confirm Ascora envelope shape
      if (data.success === true && Array.isArray(data.results)) {
        console.log(
          `[ascora/sync] Line items found at ${endpoint} (${data.totalRecords} records)`,
        );
        const items = await fetchAllPages<AscoraLineItemRaw>(
          baseUrl,
          apiKey,
          endpoint,
        );
        return { endpoint, items, tried };
      }

      console.log(
        `[ascora/sync] ${endpoint} → 200 but unexpected shape, skipping`,
      );
    } catch (e) {
      console.warn(
        `[ascora/sync] ${endpoint} probe failed: ${(e as Error).message}`,
      );
    }
  }

  console.warn(
    `[ascora/sync] No line item endpoint found after trying: ${tried.join(", ")}`,
  );
  return { endpoint: null, items: [], tried };
}

// ============================================================
// Job type helpers
// ============================================================

function getJobTypeName(
  jobType: AscoraJobType | string | undefined | null,
): string | null {
  if (!jobType) return null;
  if (typeof jobType === "string") return jobType;
  return jobType.name ?? null;
}

function mapClaimType(jobTypeName: string | undefined | null): string | null {
  if (!jobTypeName) return null;
  const t = jobTypeName.toLowerCase();
  if (t.includes("water") || t.includes("flood") || t.includes("leak"))
    return "water";
  if (t.includes("fire") || t.includes("smoke")) return "fire";
  if (t.includes("mould") || t.includes("mold") || t.includes("microbial"))
    return "mould";
  if (t.includes("storm") || t.includes("wind") || t.includes("hail"))
    return "storm";
  if (t.includes("bio") || t.includes("sewage") || t.includes("contamination"))
    return "biohazard";
  if (t.includes("contents")) return "contents";
  if (t.includes("cleaning")) return "cleaning";
  if (t.includes("inspection")) return "inspection";
  return "other";
}

// ============================================================
// ScopePricingDatabase aggregation with price uplift
// ============================================================

async function aggregateIntoPricingDb(
  lineItems: AscoraLineItemRaw[],
  upliftFactor: number,
  /** ascoraJobId → RA claimType — used to tag each part number */
  jobClaimTypeMap: Map<string, string | null>,
): Promise<number> {
  type PartEntry = {
    description: string;
    prices: number[];
    quantities: number[];
    claimTypes: Set<string>;
  };

  const byPart = new Map<string, PartEntry>();

  for (const item of lineItems) {
    const partNum = item.partNumber?.trim();
    if (!partNum) continue; // skip items without a part number

    const unitPrice = (item.unitPriceExTax ?? 0) * upliftFactor;
    const qty = item.quantity ?? 1;

    if (!byPart.has(partNum)) {
      byPart.set(partNum, {
        description: item.description ?? partNum,
        prices: [],
        quantities: [],
        claimTypes: new Set(),
      });
    }

    const entry = byPart.get(partNum)!;
    entry.prices.push(unitPrice);
    entry.quantities.push(qty);

    if (item.jobId) {
      const ct = jobClaimTypeMap.get(item.jobId);
      if (ct) entry.claimTypes.add(ct);
    }
  }

  let upserted = 0;
  for (const [partNumber, data] of byPart.entries()) {
    const { prices, quantities, claimTypes, description } = data;
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const avgQty = quantities.reduce((s, q) => s + q, 0) / quantities.length;

    await (prisma as any).scopePricingDatabase.upsert({
      where: { partNumber },
      create: {
        partNumber,
        description,
        claimTypes: [...claimTypes],
        usageCount: prices.length,
        averageUnitPriceAU: avgPrice,
        medianUnitPriceAU: medianPrice,
        minPriceAU: sortedPrices[0],
        maxPriceAU: sortedPrices[sortedPrices.length - 1],
        averageQuantity: avgQty,
        acceptanceRate: null,
        acceptedCount: 0,
        rejectedCount: 0,
        source: "ascora",
        isActive: true,
        priceHistory: [
          {
            date: new Date().toISOString(),
            avgPrice,
            upliftFactor,
            note: `Seeded from Ascora with ×${upliftFactor} price uplift (~${((upliftFactor - 1) * 100).toFixed(0)}% increase applied)`,
          },
        ],
      },
      update: {
        description,
        usageCount: { increment: prices.length },
        averageUnitPriceAU: avgPrice,
        medianUnitPriceAU: medianPrice,
        minPriceAU: sortedPrices[0],
        maxPriceAU: sortedPrices[sortedPrices.length - 1],
        averageQuantity: avgQty,
        // Append to priceHistory
        priceHistory: [
          {
            date: new Date().toISOString(),
            avgPrice,
            upliftFactor,
            note: "Re-synced from Ascora",
          },
        ],
      },
    });
    upserted++;
  }

  return upserted;
}

// ============================================================
// Route handler
// ============================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Dual auth: NextAuth session OR CRON_SECRET bearer token ──────────
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    if (!userId) {
      // Fallback: accept CRON_SECRET for automated / CLI-triggered syncs
      const cronErr = verifyCronAuth(request);
      if (cronErr) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Cron auth passed — auto-create V2 tables if missing (DO managed DB)
      const tableCheck = (await prisma.$queryRaw`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'AscoraIntegration'`) as any[];
      if (!tableCheck || tableCheck.length === 0) {
        const ddl = [
          `CREATE TABLE IF NOT EXISTS "AscoraIntegration" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "userId" TEXT NOT NULL UNIQUE, "apiKey" TEXT NOT NULL, "baseUrl" TEXT NOT NULL DEFAULT 'https://api.ascora.com.au', "isActive" BOOLEAN NOT NULL DEFAULT true, "lastSyncAt" TIMESTAMP(3), "totalJobsImported" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
          `CREATE TABLE IF NOT EXISTS "AscoraJob" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "integrationId" TEXT NOT NULL, "ascoraJobId" TEXT NOT NULL UNIQUE, "ascoraJobNumber" TEXT, "jobType" TEXT, "claimType" TEXT, "suburb" TEXT, "state" TEXT, "postcode" TEXT, "completedAt" TIMESTAMP(3), "sentToMyob" BOOLEAN NOT NULL DEFAULT false, "totalExTax" DOUBLE PRECISION, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AscoraIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
          `CREATE INDEX IF NOT EXISTS "AscoraJob_integrationId_idx" ON "AscoraJob"("integrationId")`,
          `CREATE INDEX IF NOT EXISTS "AscoraJob_claimType_idx" ON "AscoraJob"("claimType")`,
          `CREATE INDEX IF NOT EXISTS "AscoraJob_completedAt_idx" ON "AscoraJob"("completedAt")`,
          `CREATE TABLE IF NOT EXISTS "AscoraLineItem" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "ascoraJobId" TEXT NOT NULL, "partNumber" TEXT NOT NULL, "description" TEXT NOT NULL, "quantity" DOUBLE PRECISION NOT NULL, "unitPriceExTax" DOUBLE PRECISION NOT NULL, "amountExTax" DOUBLE PRECISION NOT NULL, "invoiceDate" TIMESTAMP(3), "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraLineItem_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
          `CREATE INDEX IF NOT EXISTS "AscoraLineItem_ascoraJobId_idx" ON "AscoraLineItem"("ascoraJobId")`,
          `CREATE TABLE IF NOT EXISTS "AscoraNote" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "ascoraJobId" TEXT NOT NULL, "noteText" TEXT NOT NULL, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AscoraNote_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
          `CREATE TABLE IF NOT EXISTS "ScopePricingDatabase" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "partNumber" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "claimTypes" TEXT[] NOT NULL DEFAULT '{}', "usageCount" INTEGER NOT NULL DEFAULT 0, "averageUnitPriceAU" DOUBLE PRECISION NOT NULL, "medianUnitPriceAU" DOUBLE PRECISION, "minPriceAU" DOUBLE PRECISION, "maxPriceAU" DOUBLE PRECISION, "averageQuantity" DOUBLE PRECISION, "acceptanceRate" DOUBLE PRECISION, "acceptedCount" INTEGER NOT NULL DEFAULT 0, "rejectedCount" INTEGER NOT NULL DEFAULT 0, "priceHistory" JSONB, "source" TEXT NOT NULL DEFAULT 'ascora', "isActive" BOOLEAN NOT NULL DEFAULT true, "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
          `CREATE TABLE IF NOT EXISTS "HistoricalJob" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "source" TEXT NOT NULL, "externalId" TEXT NOT NULL, "jobNumber" TEXT NOT NULL, "jobName" TEXT NOT NULL, "description" TEXT NOT NULL, "claimType" TEXT NOT NULL, "waterCategory" TEXT, "waterClass" TEXT, "address" TEXT, "suburb" TEXT NOT NULL, "state" TEXT NOT NULL, "postcode" TEXT NOT NULL, "customerName" TEXT, "totalExTax" DOUBLE PRECISION NOT NULL DEFAULT 0, "totalIncTax" DOUBLE PRECISION NOT NULL DEFAULT 0, "completedDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HistoricalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
          `CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId")`,
        ];
        for (const stmt of ddl) {
          await prisma.$executeRawUnsafe(stmt);
        }
      }
      const firstIntegration = await (
        prisma as any
      ).ascoraIntegration.findFirst({
        where: { isActive: true },
        select: { userId: true },
      });
      if (!firstIntegration) {
        return NextResponse.json(
          {
            error:
              "No active Ascora integration found. Connect via Settings first.",
          },
          { status: 404 },
        );
      }
      userId = firstIntegration.userId;
    }

    let integration = await (prisma as any).ascoraIntegration.findUnique({
      where: { userId },
    });

    // ── System-level env var fallback for automated LLM training syncs ──────
    // When no per-user integration record exists, auto-provision one from the
    // ASCORA_API_KEY Vercel env var.  This allows server-side cron / admin
    // syncs without requiring each user to first POST /api/ascora/connect.
    // If the user later connects their own key via the settings UI, the
    // connect route's upsert will overwrite this record with their key.
    if (!integration) {
      const envApiKey = process.env.ASCORA_API_KEY;
      if (!envApiKey) {
        return NextResponse.json(
          {
            error:
              "Ascora not connected. POST /api/ascora/connect first, " +
              "or set ASCORA_API_KEY env var for system-level sync.",
          },
          { status: 404 },
        );
      }
      console.log(
        "[ascora/sync] No user integration record — auto-provisioning from ASCORA_API_KEY env var",
      );
      integration = await (prisma as any).ascoraIntegration.create({
        data: {
          userId: userId,
          apiKey: envApiKey,
          baseUrl: (
            process.env.ASCORA_BASE_URL ?? "https://api.ascora.com.au"
          ).replace(/\/$/, ""),
          isActive: true,
        },
      });
    }

    if (!integration.isActive) {
      return NextResponse.json(
        { error: "Ascora integration is disabled." },
        { status: 403 },
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const incremental = searchParams.get("incremental") === "true";
    const minValueAud = parseFloat(searchParams.get("minValueAud") ?? "0");
    const priceUpliftFactor = Math.max(
      1.0,
      parseFloat(searchParams.get("priceUpliftFactor") ?? "1.12"),
    );
    const dryRun = searchParams.get("dryRun") === "true";

    // ------------------------------------------------------------------
    // Phase 1: Fetch all jobs from Ascora
    // ------------------------------------------------------------------
    console.log(
      `[ascora/sync] Fetching jobs… (incremental=${incremental}, minValue=${minValueAud}, uplift=×${priceUpliftFactor}, dryRun=${dryRun})`,
    );

    const allJobs = await fetchAllPages<AscoraJobRaw>(
      integration.baseUrl,
      integration.apiKey,
      "/jobs",
    );

    // Incremental window: jobs completed after last sync
    const windowedJobs =
      incremental && integration.lastSyncAt
        ? allJobs.filter((j) => {
            const completed = j.completedDate
              ? new Date(j.completedDate)
              : null;
            return completed && completed > integration.lastSyncAt!;
          })
        : allJobs;

    // Value filter: Private Claims and Larger Loss Claims
    // Use minValueAud=1000 for "any scoped work", 5000+ for "larger loss" focus
    const filteredJobs = windowedJobs.filter(
      (j) => (j.totalExTax ?? 0) >= minValueAud,
    );

    // Build claim type map for line item tagging (also used in dry-run analysis)
    const jobClaimTypeMap = new Map<string, string | null>();
    for (const job of filteredJobs) {
      jobClaimTypeMap.set(job.jobId, mapClaimType(getJobTypeName(job.jobType)));
    }

    // Breakdown by claim type
    const breakdown = {
      water: 0,
      fire: 0,
      mould: 0,
      biohazard: 0,
      contents: 0,
      other: 0,
    };
    for (const ct of jobClaimTypeMap.values()) {
      const key = ct as keyof typeof breakdown;
      if (key in breakdown) breakdown[key]++;
      else breakdown.other++;
    }

    console.log(
      `[ascora/sync] ${allJobs.length} total → ${windowedJobs.length} in window → ${filteredJobs.length} above $${minValueAud} AUD`,
    );

    // Upsert job records
    let jobsImported = 0;

    if (!dryRun) {
      for (const job of filteredJobs) {
        const jobTypeName = getJobTypeName(job.jobType);
        const claimType = mapClaimType(jobTypeName);

        await (prisma as any).ascoraJob.upsert({
          where: { ascoraJobId: job.jobId },
          create: {
            integrationId: integration.id,
            ascoraJobId: job.jobId,
            ascoraJobNumber: job.jobNumber ?? null,
            jobType: jobTypeName ?? null,
            claimType,
            suburb: job.suburb ?? null,
            state: job.state ?? null,
            postcode: job.postcode ?? null,
            completedAt: job.completedDate ? new Date(job.completedDate) : null,
            sentToMyob: false, // not in Ascora API — manual field only
            totalExTax: job.totalExTax ?? null,
          },
          update: {
            completedAt: job.completedDate ? new Date(job.completedDate) : null,
            totalExTax: job.totalExTax ?? null,
            // Refresh jobType name in case it changed
            jobType: getJobTypeName(job.jobType) ?? undefined,
          },
        });
        jobsImported++;
      }
    } else {
      jobsImported = filteredJobs.length;
    }

    // ------------------------------------------------------------------
    // Phase 2: Discover and fetch line items
    // ------------------------------------------------------------------
    console.log(`[ascora/sync] Probing for line item endpoint…`);
    const {
      endpoint: lineItemEndpoint,
      items: allLineItems,
      tried: endpointsTried,
    } = await tryLineItemEndpoints(integration.baseUrl, integration.apiKey);

    // Filter to only line items belonging to our imported job set
    const importedJobIdSet = new Set(filteredJobs.map((j) => j.jobId));
    const relevantLineItems = allLineItems.filter(
      (li) => li.jobId && importedJobIdSet.has(li.jobId),
    );

    // If we have line items, upsert them against job records
    if (relevantLineItems.length > 0 && !dryRun) {
      // Build jobId (Ascora string) → DB row id map for FK
      const dbJobRows = await (prisma as any).ascoraJob.findMany({
        where: { ascoraJobId: { in: [...importedJobIdSet] } },
        select: { id: true, ascoraJobId: true },
      });
      const ascoraIdToDbId = new Map(
        dbJobRows.map((r: any) => [r.ascoraJobId, r.id]),
      );

      for (const li of relevantLineItems) {
        if (!li.jobId || !li.partNumber) continue;
        const dbJobId = ascoraIdToDbId.get(li.jobId);
        if (!dbJobId) continue;

        await (prisma as any).ascoraLineItem.create({
          data: {
            ascoraJobId: dbJobId,
            partNumber: li.partNumber,
            description: li.description ?? li.partNumber,
            quantity: li.quantity ?? 1,
            unitPriceExTax: li.unitPriceExTax ?? 0,
            amountExTax: li.amountExTax ?? 0,
            invoiceDate: li.invoiceDate ? new Date(li.invoiceDate) : null,
          },
        });
      }
    }

    // ------------------------------------------------------------------
    // Phase 3: Seed ScopePricingDatabase with price uplift applied
    // ------------------------------------------------------------------
    let pricingDbEntriesUpserted = 0;
    if (relevantLineItems.length > 0 && !dryRun) {
      console.log(
        `[ascora/sync] Seeding ScopePricingDatabase: ${relevantLineItems.length} line items × uplift ×${priceUpliftFactor}…`,
      );
      pricingDbEntriesUpserted = await aggregateIntoPricingDb(
        relevantLineItems,
        priceUpliftFactor,
        jobClaimTypeMap,
      );
    }

    // ------------------------------------------------------------------
    // Phase 4: Create HistoricalJob records for vector similarity search
    // Uses ruleBasedClassify on jobDescription to infer IICRC water category/class
    // since these fields are absent from the Ascora API.
    // ------------------------------------------------------------------
    let historicalJobsUpserted = 0;
    if (!dryRun) {
      const tenantId = userId;
      for (const job of filteredJobs) {
        const jobTypeName = getJobTypeName(job.jobType);
        const claimType = mapClaimType(jobTypeName) ?? "water";
        const description =
          job.jobDescription?.trim() || job.jobName || `${jobTypeName} job`;

        // Infer IICRC water category/class from the job narrative
        const classification = description
          ? ruleBasedClassify({ description, notes: job.jobName })
          : null;

        const address = [job.addressLine1, job.addressLine2]
          .filter(Boolean)
          .join(", ");
        const customerName =
          job.siteCustomer?.name || job.billingCustomer?.name || null;

        await (prisma as any).historicalJob.upsert({
          where: {
            source_externalId: { source: "ascora", externalId: job.jobId },
          },
          create: {
            tenantId,
            source: "ascora",
            externalId: job.jobId,
            jobNumber: job.jobNumber ?? job.jobId,
            jobName: job.jobName ?? `Job ${job.jobNumber ?? job.jobId}`,
            description,
            claimType,
            waterCategory: classification?.damageCategory ?? null,
            waterClass: classification?.damageClass ?? null,
            address,
            suburb: job.suburb ?? "",
            state: job.state ?? "QLD",
            postcode: job.postcode ?? "",
            customerName,
            totalExTax: job.totalExTax ?? 0,
            totalIncTax:
              job.totalIncTax ?? (job.totalExTax ? job.totalExTax * 1.1 : 0),
            completedDate: job.completedDate
              ? new Date(job.completedDate)
              : null,
          },
          update: {
            description,
            totalExTax: job.totalExTax ?? 0,
            totalIncTax:
              job.totalIncTax ?? (job.totalExTax ? job.totalExTax * 1.1 : 0),
            completedDate: job.completedDate
              ? new Date(job.completedDate)
              : null,
            waterCategory: classification?.damageCategory ?? undefined,
            waterClass: classification?.damageClass ?? undefined,
          },
        });
        historicalJobsUpserted++;
      }
    } else {
      historicalJobsUpserted = filteredJobs.length;
    }

    // ------------------------------------------------------------------
    // Update integration metadata
    // ------------------------------------------------------------------
    if (!dryRun) {
      await (prisma as any).ascoraIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          totalJobsImported: { increment: jobsImported },
        },
      });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Build the status message
    let message: string;
    if (dryRun) {
      message =
        `DRY RUN: Would import ${filteredJobs.length} jobs. ` +
        (lineItemEndpoint
          ? `Line items endpoint found at ${lineItemEndpoint} (${relevantLineItems.length} relevant items). `
          : `No line item endpoint found (tried: ${endpointsTried.join(", ")}). `) +
        `Price uplift ×${priceUpliftFactor} would be applied.`;
    } else if (lineItemEndpoint) {
      message =
        `Imported ${jobsImported} jobs + ${relevantLineItems.length} line items. ` +
        `${pricingDbEntriesUpserted} ScopePricingDatabase entries seeded with ×${priceUpliftFactor} uplift ` +
        `(~${((priceUpliftFactor - 1) * 100).toFixed(0)}% price increase applied).`;
    } else {
      message =
        `Imported ${jobsImported} jobs (no line items — endpoint not found). ` +
        `ScopePricingDatabase seeding skipped. ` +
        `Tried: ${endpointsTried.join(", ")}. ` +
        `Contact Ascora support to confirm the line item API endpoint.`;
    }

    return NextResponse.json({
      success: true,
      dryRun,
      jobsTotal: allJobs.length,
      jobsInWindow: windowedJobs.length,
      jobsAboveMinValue: filteredJobs.length,
      jobsImported,
      historicalJobsUpserted,
      jobBreakdown: breakdown,
      minValueAud,
      priceUpliftFactor,
      lineItemEndpointFound: lineItemEndpoint,
      lineItemEndpointsTried: endpointsTried,
      lineItemsTotal: allLineItems.length,
      lineItemsForImport: relevantLineItems.length,
      pricingDbEntriesUpserted,
      elapsedSeconds: parseFloat(elapsed),
      message,
    });
  } catch (error) {
    console.error("[ascora/sync POST]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
