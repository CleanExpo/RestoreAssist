/**
 * POST /api/ascora/sync
 *
 * Full historical import of Ascora jobs + line items for the authenticated user.
 * Seeds ScopePricingDatabase with real AU pricing data.
 *
 * Runs paginated (pageSize=1000 per Ascora).
 * Idempotent: existing ascoraJobId records are upserted on conflict.
 *
 * TLS NOTE: if Ascora connectivity fails on certificate validation, fix the
 * upstream certificate chain or configure scoped trusted CA material. Do not
 * disable process-wide Node TLS verification.
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
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ruleBasedClassify } from "@/lib/ai/auto-classify";
import { verifyCronAuth } from "@/lib/cron/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { encrypt, decrypt } from "@/lib/credential-vault";
import { isEncryptedToken } from "@/lib/auth/account-tokens";
import { requireAddon } from "@/lib/entitlements";
import { sanitizeForPostgresText } from "@/lib/sanitize";
import { SERVICE_CRM_SKU } from "@/lib/billing/service-crm-addon";
import { fetchAscoraWithRetry } from "@/lib/integrations/ascora/fetch-with-retry";

// ============================================================
// Ascora API types — actual camelCase structure from API
// ============================================================

interface AscoraJobType {
  id: string;
  name: string;
}

export interface AscoraJobRaw {
  jobId: string;
  jobNumber?: string;
  /** Human-readable job name e.g. "FEN - Sanagozza - Loganholme" */
  jobName?: string;
  /** Full scope narrative — goldmine for AI training / IICRC classification */
  jobDescription?: string;
  /** Post-completion narrative of what was actually done on site */
  workUndertaken?: string;
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

// /Accounting/GetInvoicesToSend response shapes (API Endpoints guide §Accounting).
// NOTE: this endpoint returns a BARE ARRAY, not the { success, results }
// envelope, and only invoices not yet marked as sent to an accounting package.
interface AscoraAccountingInvoiceLineRaw {
  itemCode?: string;
  description?: string;
  quantity?: number;
  unitAmountExTax?: number;
  amountExTax?: number;
  invoiceLineType?: string; // "material" | "labour" | "discount" | "none"
}

interface AscoraAccountingInvoiceRaw {
  id?: string;
  invoiceNumber?: string;
  invoiceDate?: string | null;
  jobId?: string;
  invoiceLines?: AscoraAccountingInvoiceLineRaw[];
}

/** /Inventory/Supplies row — DR's own rate card (sell price per part). */
interface AscoraSupplyRaw {
  supplyId?: string;
  partNumber?: string;
  description?: string;
  unitCostExTax?: number;
  unitSellExTax?: number;
  unitOfMeasure?: string;
}

/**
 * Flatten accounting invoices into the importer's line-item shape.
 * Material lines key by itemCode; labour lines are folded into a synthetic
 * "LABOUR" part so hourly rates enter the pricing benchmark; discount and
 * uncoded lines are skipped (noise, not priceable scope).
 */
export function mapAccountingInvoicesToLineItems(
  invoices: AscoraAccountingInvoiceRaw[],
): AscoraLineItemRaw[] {
  if (!Array.isArray(invoices)) return [];
  const items: AscoraLineItemRaw[] = [];
  for (const inv of invoices) {
    for (const line of inv.invoiceLines ?? []) {
      const itemCode = line.itemCode?.trim();
      const isLabour = line.invoiceLineType === "labour";
      if (!itemCode && !isLabour) continue;
      if (line.invoiceLineType === "discount") continue;
      items.push({
        jobId: inv.jobId,
        partNumber: itemCode || "LABOUR",
        description: line.description,
        quantity: line.quantity,
        unitPriceExTax: line.unitAmountExTax,
        amountExTax: line.amountExTax,
        invoiceDate: inv.invoiceDate ?? null,
      });
    }
  }
  return items;
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
    // RA-273 — retry transient failures (network/5xx/429) with exponential
    // backoff, honouring Retry-After, instead of aborting the whole import
    // on the first blip.
    const res = await fetchAscoraWithRetry(
      url,
      { headers: { Auth: apiKey, "Content-Type": "application/json" } },
      { timeoutMs: 30000, context: `${path} (page ${page})` },
    );

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
// Accounting invoices — the real line-item source (RA-7026)
// ============================================================

/**
 * GET /Accounting/GetInvoicesToSend returns a bare array of invoices with
 * embedded invoiceLines. Only invoices not yet marked as sent to an
 * accounting package are included — for tenants that push to Xero/MYOB this
 * is a residue, not full history, so legacy endpoint discovery stays as a
 * fallback.
 */
async function fetchAccountingInvoices(
  baseUrl: string,
  apiKey: string,
): Promise<AscoraAccountingInvoiceRaw[]> {
  // Tomorrow's date so every dated invoice qualifies ("prior to" is strict).
  const priorToDate = new Date(Date.now() + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const res = await fetchAscoraWithRetry(
    `${baseUrl}/Accounting/GetInvoicesToSend?priorToDate=${priorToDate}`,
    { headers: { Auth: apiKey, "Content-Type": "application/json" } },
    { timeoutMs: 60000, context: "/Accounting/GetInvoicesToSend" },
  );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ============================================================
// Rate card — /Inventory/Supplies (RA-7026)
// ============================================================

/**
 * Seed the tenant's own sell-price book into ScopePricingDatabase. No uplift
 * is applied — these are the prices the business itself set. Learned
 * (invoice-aggregated) stats always win: for rows another source owns, the
 * rate-card price is only appended to priceHistory.
 */
async function seedRateCardIntoPricingDb(
  supplies: AscoraSupplyRaw[],
): Promise<number> {
  let upserted = 0;
  for (const supply of supplies) {
    const partNumber = supply.partNumber?.trim();
    const sell = supply.unitSellExTax;
    if (!partNumber || typeof sell !== "number" || sell <= 0) continue;

    const historyEntry = {
      date: new Date().toISOString(),
      avgPrice: sell,
      note: "Ascora rate card (unitSellExTax)",
    };
    const existing = await (prisma as any).scopePricingDatabase.findUnique({
      where: { partNumber },
      select: { id: true, source: true, priceHistory: true },
    });

    if (!existing) {
      await (prisma as any).scopePricingDatabase.create({
        data: {
          partNumber,
          description: supply.description ?? partNumber,
          claimTypes: [],
          usageCount: 0,
          averageUnitPriceAU: sell,
          medianUnitPriceAU: sell,
          minPriceAU: sell,
          maxPriceAU: sell,
          acceptanceRate: null,
          acceptedCount: 0,
          rejectedCount: 0,
          source: "ascora-rate-card",
          isActive: true,
          priceHistory: [historyEntry],
        },
      });
    } else {
      const history = [
        ...(Array.isArray(existing.priceHistory) ? existing.priceHistory : []),
        historyEntry,
      ];
      await (prisma as any).scopePricingDatabase.update({
        where: { partNumber },
        data:
          existing.source === "ascora-rate-card"
            ? {
                description: supply.description ?? partNumber,
                averageUnitPriceAU: sell,
                medianUnitPriceAU: sell,
                minPriceAU: sell,
                maxPriceAU: sell,
                priceHistory: history,
                lastUpdated: new Date(),
              }
            : { priceHistory: history, lastUpdated: new Date() },
      });
    }
    upserted++;
  }
  return upserted;
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
      const res = await fetchAscoraWithRetry(
        probeUrl,
        { headers: { Auth: apiKey, "Content-Type": "application/json" } },
        { timeoutMs: 10000, context: `${endpoint} (probe)` },
      );

      const data = await res.json();
      // Confirm Ascora envelope shape
      if (data.success === true && Array.isArray(data.results)) {
        const items = await fetchAllPages<AscoraLineItemRaw>(
          baseUrl,
          apiKey,
          endpoint,
        );
        return { endpoint, items, tried };
      }
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
// RA-274 — HistoricalJob "CEO Board Hardening" field mapping
//
// classificationSource / claimNumber / scopeOfWorks have genuine Ascora
// source data and are refreshed on every sync (create + update). insurerName
// / totalLabourHours / durationDays have NO corresponding field anywhere in
// the Ascora job payload (AscoraJobRaw only exposes siteCustomer/
// billingCustomer — already consumed for customerName — and completedDate,
// with no start date to derive a duration from) — they are deliberately left
// null rather than fabricated, and set once at create time only so a future
// manual-entry channel isn't clobbered by a null on every resync.
// ============================================================

export function buildHistoricalJobRefreshableFields(job: AscoraJobRaw): {
  classificationSource: string;
  claimNumber: string | null;
  scopeOfWorks: string | null;
} {
  return {
    // claimType/waterCategory/waterClass on this route are always derived by
    // regex keyword matching (mapClaimType + ruleBasedClassify) — Ascora's
    // API never supplies a claim type or IICRC category/class directly.
    classificationSource: "rule-based",
    // clientOrderNumber is the AU restoration-industry reference number an
    // insurer/loss adjuster issues and the contractor quotes back on
    // invoices — the closest genuine "claim number" field Ascora exposes.
    claimNumber: sanitizeForPostgresText(job.clientOrderNumber?.trim() || "") || null,
    // jobDescription is the pre-works scope narrative; workUndertaken is the
    // post-completion account of what was actually done — both are training
    // signal, so keep them together in one narrative field. Sanitize for
    // Postgres: NUL bytes AND unpaired UTF-16 surrogates in this free-text both
    // make Postgres reject the historicalJob.upsert (08P01) — RA-7026 prod sync
    // blocker; the surrogate case skipped ~215 jobs after the NUL-only fix.
    scopeOfWorks:
      sanitizeForPostgresText(
        combineScopeNarratives(job.jobDescription, job.workUndertaken) ?? "",
      ) || null,
  };
}

/**
 * HistoricalJob.waterCategory/waterClass are String? columns, but the
 * classifier emits NUMERIC damageCategory/damageClass (1-3 / 1-4). Passing the
 * raw number makes Prisma reject the entire upsert — which silently failed the
 * whole prod historical sync (RA-7026) despite green mocked tests, because the
 * mock never enforced the real column type. Coerce here; `undefined` means
 * "leave unchanged" so an update never wipes a previously-inferred value.
 */
export function coerceHistoricalWaterFields(
  classification: { damageCategory?: number; damageClass?: number } | null | undefined,
): { waterCategory: string | undefined; waterClass: string | undefined } {
  return {
    waterCategory:
      classification?.damageCategory != null
        ? String(classification.damageCategory)
        : undefined,
    waterClass:
      classification?.damageClass != null
        ? String(classification.damageClass)
        : undefined,
  };
}

function combineScopeNarratives(
  jobDescription?: string,
  workUndertaken?: string,
): string | null {
  const scope = jobDescription?.trim();
  const undertaken = workUndertaken?.trim();
  if (scope && undertaken)
    return `${scope}\n\nWork undertaken: ${undertaken}`;
  if (undertaken) return `Work undertaken: ${undertaken}`;
  return scope || null;
}

// ============================================================
// ScopePricingDatabase aggregation with price uplift
// ============================================================

// Exported for the batched labour importer (cron/sync-ascora-labour), which
// feeds LABOUR-<role> lines through the same aggregation — mirroring how the
// cron wrapper reuses this route's POST handler in-process.
export async function aggregateIntoPricingDb(
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

// RA-7026: a full historical import (4,003 jobs × sequential upserts across
// two tables + line items + rate card) exceeds the 300s default and would be
// killed mid-run on every attempt. 800s is the Vercel Pro ceiling.
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Dual auth: NextAuth session OR CRON_SECRET bearer token ──────────
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // RA-6920 B1: a user-triggered sync (session auth) is gated by the
    // recurring SERVICE_CRM add-on. The CRON_SECRET path below is an
    // automated system-level sync, not a user action, so it is intentionally
    // left ungated. Existing users who connected before this gate shipped
    // are grandfathered (scripts/backfill-grandfather-service-crm-addon.ts).
    if (userId) {
      const addonGate = await requireAddon(userId, SERVICE_CRM_SKU);
      if (!addonGate.allowed) return addonGate.response;
    }

    if (!userId) {
      // Fallback: accept CRON_SECRET for automated / CLI-triggered syncs
      const cronErr = verifyCronAuth(request);
      if (cronErr) {
        return apiError(request, {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        });
      }
      // Cron auth passed — verify the migration-created Ascora tables exist.
      const tableCheck = (await prisma.$queryRaw(
        Prisma.sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'AscoraIntegration'`,
      )) as any[];
      if (!tableCheck || tableCheck.length === 0) {
        // RA-1548 — left raw: 503 has no mapping in the status->code table
        // (service-unavailable / not-provisioned is neither a client nor an
        // upstream error), so keep the ad-hoc shape.
        return NextResponse.json(
          {
            error:
              "Ascora schema is not provisioned. Run Prisma migrations before syncing.",
          },
          { status: 503 },
        );
      }
      const firstIntegration = await (
        prisma as any
      ).ascoraIntegration.findFirst({
        where: { isActive: true },
        select: { userId: true },
      });
      if (firstIntegration) {
        userId = firstIntegration.userId;
      } else {
        // RA-7026 — with zero integration rows this path used to 404 before
        // the env fallback below could run, so a cron-only deployment could
        // never bootstrap itself (the session path is gated by the
        // SERVICE_CRM add-on). ASCORA_SYNC_USER_EMAIL names the account the
        // system-level sync attaches jobs to; with it + ASCORA_API_KEY set,
        // the fallback below provisions the integration record from env.
        const syncEmail = process.env.ASCORA_SYNC_USER_EMAIL?.trim();
        if (!process.env.ASCORA_API_KEY || !syncEmail) {
          return apiError(request, {
            code: "NOT_FOUND",
            message:
              "No active Ascora integration found. Connect via Settings " +
              "first, or set ASCORA_API_KEY + ASCORA_SYNC_USER_EMAIL for a " +
              "system-level bootstrap.",
            status: 404,
          });
        }
        const syncUser = await prisma.user.findUnique({
          where: { email: syncEmail },
          select: { id: true },
        });
        if (!syncUser) {
          return apiError(request, {
            code: "NOT_FOUND",
            message:
              "ASCORA_SYNC_USER_EMAIL does not match any user account. " +
              "Set it to the exact email of the account the sync should " +
              "attach jobs to.",
            status: 404,
          });
        }
        userId = syncUser.id;
      }
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
        return apiError(request, {
          code: "NOT_FOUND",
          message:
            "Ascora not connected. POST /api/ascora/connect first, " +
            "or set ASCORA_API_KEY env var for system-level sync.",
          status: 404,
        });
      }
      integration = await (prisma as any).ascoraIntegration.create({
        data: {
          userId: userId,
          apiKey: encrypt(envApiKey),
          baseUrl: (
            process.env.ASCORA_BASE_URL ?? "https://api.ascora.com.au"
          ).replace(/\/$/, ""),
          isActive: true,
        },
      });
    }

    if (!integration.isActive) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Ascora integration is disabled.",
        status: 403,
      });
    }

    // Decrypt the stored API key for outbound Ascora calls. Legacy plaintext
    // rows (pre-backfill) aren't in cipher shape, so pass them through unchanged.
    const apiKey = isEncryptedToken(integration.apiKey)
      ? decrypt(integration.apiKey)
      : integration.apiKey;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const incremental = searchParams.get("incremental") === "true";
    // RA-1301 — parseFloat("Infinity") returns Infinity, parseFloat("1e308")
    // returns a real huge number, and Math.max(min, Infinity) === Infinity.
    // Every price would get multiplied by Infinity → NaN/overflow → garbage
    // written to ScopePricingDatabase. Guard with Number.isFinite + ceiling.
    const parseFiniteFloat = (raw: string, fallback: number): number => {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    const minValueAud = Math.max(
      0,
      parseFiniteFloat(searchParams.get("minValueAud") ?? "0", 0),
    );
    // Hard ceiling of 10 (=900% uplift) rejects hostile 1e308 and accidental
    // decimal-misreads (e.g. "112" meaning 1.12). 10x is already well above
    // any legitimate business range.
    const priceUpliftFactor = Math.min(
      10,
      Math.max(
        1.0,
        parseFiniteFloat(searchParams.get("priceUpliftFactor") ?? "1.12", 1.12),
      ),
    );
    const dryRun = searchParams.get("dryRun") === "true";

    // ------------------------------------------------------------------
    // Phase 1: Fetch all jobs from Ascora
    // ------------------------------------------------------------------
    const allJobs = await fetchAllPages<AscoraJobRaw>(
      integration.baseUrl,
      apiKey,
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
    // Phase 2: Fetch line items — accounting surface first, legacy fallback
    // ------------------------------------------------------------------
    // RA-7026: every legacy candidate endpoint 404s on the live Ascora API
    // (verified 2026-07-09 against the official API Endpoints guide). The
    // real line-item source is /Accounting/GetInvoicesToSend.
    let lineItemEndpoint: string | null = null;
    let allLineItems: AscoraLineItemRaw[] = [];
    let endpointsTried: string[] = [];
    let accountingInvoiceCount = 0;
    try {
      const accountingInvoices = await fetchAccountingInvoices(
        integration.baseUrl,
        apiKey,
      );
      accountingInvoiceCount = accountingInvoices.length;
      allLineItems = mapAccountingInvoicesToLineItems(accountingInvoices);
      if (allLineItems.length > 0) {
        lineItemEndpoint = "/Accounting/GetInvoicesToSend";
      }
    } catch {
      // Accounting surface unavailable on this tenant — legacy discovery below.
    }
    if (allLineItems.length === 0) {
      const legacy = await tryLineItemEndpoints(integration.baseUrl, apiKey);
      lineItemEndpoint = legacy.endpoint;
      allLineItems = legacy.items;
      endpointsTried = legacy.tried;
    }

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
        orderBy: { ascoraJobId: "asc" },
        take: importedJobIdSet.size,
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
      pricingDbEntriesUpserted = await aggregateIntoPricingDb(
        relevantLineItems,
        priceUpliftFactor,
        jobClaimTypeMap,
      );
    }

    // ------------------------------------------------------------------
    // Phase 3b: Seed the tenant's rate card from /Inventory/Supplies
    // ------------------------------------------------------------------
    let rateCardPartsUpserted = 0;
    if (!dryRun) {
      try {
        const supplies = await fetchAllPages<AscoraSupplyRaw>(
          integration.baseUrl,
          apiKey,
          "/Inventory/Supplies",
        );
        rateCardPartsUpserted = await seedRateCardIntoPricingDb(supplies);
      } catch {
        // Rate card is best-effort — the jobs/lines import must not fail on it.
      }
    }

    // ------------------------------------------------------------------
    // Phase 4: Create HistoricalJob records for vector similarity search
    // Uses ruleBasedClassify on jobDescription to infer IICRC water category/class
    // since these fields are absent from the Ascora API.
    // ------------------------------------------------------------------
    let historicalJobsUpserted = 0;
    if (!dryRun) {
      const tenantId = userId;
      let historicalJobErrors = 0;
      for (const job of filteredJobs) {
        const jobTypeName = getJobTypeName(job.jobType);
        const claimType = mapClaimType(jobTypeName) ?? "water";
        const description = sanitizeForPostgresText(
          job.jobDescription?.trim() || job.jobName || `${jobTypeName} job`,
        );

        // Infer IICRC water category/class from the job narrative
        const classification = description
          ? ruleBasedClassify({ description, notes: job.jobName })
          : null;
        const water = coerceHistoricalWaterFields(classification);

        const address = [job.addressLine1, job.addressLine2]
          .filter(Boolean)
          .join(", ");
        const customerName =
          job.siteCustomer?.name || job.billingCustomer?.name || null;

        const upsertArgs = {
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
            waterCategory: water.waterCategory ?? null,
            waterClass: water.waterClass ?? null,
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
            ...buildHistoricalJobRefreshableFields(job),
            // No dedicated insurer/labour-hours/duration field exists on the
            // Ascora job payload — see the comment on
            // buildHistoricalJobRefreshableFields above.
            insurerName: null,
            totalLabourHours: null,
            durationDays: null,
          },
          update: {
            description,
            totalExTax: job.totalExTax ?? 0,
            totalIncTax:
              job.totalIncTax ?? (job.totalExTax ? job.totalExTax * 1.1 : 0),
            completedDate: job.completedDate
              ? new Date(job.completedDate)
              : null,
            waterCategory: water.waterCategory,
            waterClass: water.waterClass,
            ...buildHistoricalJobRefreshableFields(job),
          },
        };
        try {
          await (prisma as any).historicalJob.upsert(upsertArgs);
          historicalJobsUpserted++;
        } catch (err) {
          historicalJobErrors++;
          // One malformed job (e.g. an un-strippable byte in a narrative) must
          // not abort the whole import and leave lastSyncAt unset — skip + log.
          console.error(
            `[ascora-sync] historicalJob upsert failed for job ${job.jobId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      if (historicalJobErrors > 0) {
        console.warn(
          `[ascora-sync] ${historicalJobErrors}/${filteredJobs.length} historicalJob upserts skipped after errors`,
        );
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
      accountingInvoiceCount,
      pricingDbEntriesUpserted,
      rateCardPartsUpserted,
      elapsedSeconds: parseFloat(elapsed),
      message,
    });
  } catch (error) {
    // RA-786: do not leak error.message to clients (fromException emits a
    // generic message; detail goes to reportError only).
    return fromException(request, error, { stage: "sync" });
  }
}
