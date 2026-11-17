import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import type { CostEstimateResult } from "@/lib/nir-cost-estimation";
import { buildEstimateLines } from "@/lib/estimate-lines";
import { isSpmLine, SPM_LINE_KIND, SPM_LINE_DESCRIPTION, SPM_HOURS, SPM_DEFAULT_HOURLY_RATE, isNewZealand, logSpmRecommendation } from "@/lib/billing/spm-line";

export const estimateRowSelect = {
  id: true, scopeItemId: true, category: true, description: true, quantity: true,
  unit: true, rate: true, subtotal: true, contingency: true, total: true,
  isEstimated: true, costDatabaseId: true, lineKind: true, createdAt: true,
} satisfies Prisma.CostEstimateSelect;

// Keep writer transactions READ COMMITTED: queued writers must see the prior commit.
async function lockInspection(tx: Prisma.TransactionClient, inspectionId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inspection" WHERE "id" = ${inspectionId} FOR UPDATE`);
}

export interface SaveEstimateRowsArgs {
  inspectionId: string;
  estimate: CostEstimateResult;
  /** The property's country (Inspection.propertyCountry). */
  country: string | null | undefined;
  /** true: replace work rows, preserving an explicitly added SPM row. */
  replace: boolean;
}

export async function saveEstimateRows(
  tx: Prisma.TransactionClient,
  args: SaveEstimateRowsArgs,
) {
  const { inspectionId, estimate, replace } = args;

  await lockInspection(tx, inspectionId);

  // Regeneration replaces work only; business-added rows survive.
  if (replace) {
    await tx.costEstimate.deleteMany({ where: {
      inspectionId,
      OR: [{ lineKind: null }, { lineKind: { not: SPM_LINE_KIND } }],
    } });
  }
  // Generated input can never insert an SPM charge.
  const stripped = estimate.items.filter(isSpmLine).reduce((sum, item) => sum.plus(item.subtotal), new Decimal(0));
  const priced = {
    ...estimate,
    items: estimate.items.filter((item) => !isSpmLine(item)),
    subtotal: new Decimal(estimate.subtotal).minus(stripped).toNumber(),
    total: new Decimal(estimate.total).minus(stripped).toNumber(),
    breakdown: { ...estimate.breakdown, other: new Decimal(estimate.breakdown.other).minus(stripped).toNumber() },
  };

  // 4. Write.
  await tx.costEstimate.createMany({
    data: buildEstimateLines(priced).map((line) => ({
      inspectionId,
      ...line,
    })),
  });
  const saved = await tx.costEstimate.findMany({ where: { inspectionId }, select: { total: true, lineKind: true }, take: 10000 });
  return {
    estimate: priced,
    savedTotalExGst: saved.reduce((sum, row) => sum.plus(row.total), new Decimal(0)).toNumber(),
    spmRowKept: saved.some(isSpmLine),
  };
}

export class SpmCountryError extends Error {}

/** Snapshot and recommendation are read before releasing the inspection lock. */
async function snapshot(tx: Prisma.TransactionClient, inspectionId: string, country: string | null | undefined) {
  const costEstimates = await tx.costEstimate.findMany({
    where: { inspectionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10000,
    select: estimateRowSelect,
  });
  return { costEstimates, spmRecommendation: logSpmRecommendation(inspectionId, costEstimates, country) };
}

async function countryAfterLock(tx: Prisma.TransactionClient, inspectionId: string) {
  const inspection = await tx.inspection.findUnique({ where: { id: inspectionId }, select: { propertyCountry: true } });
  if (!inspection) throw new Error("Inspection not found");
  if (isNewZealand(inspection.propertyCountry)) throw new SpmCountryError("SPM is available for Australian properties only");
  return inspection.propertyCountry;
}

export async function addSpmRow(tx: Prisma.TransactionClient, inspectionId: string, userId: string) {
  await lockInspection(tx, inspectionId);
  const country = await countryAfterLock(tx, inspectionId);
  let row = await tx.costEstimate.findFirst({ where: { inspectionId, lineKind: SPM_LINE_KIND }, select: { id: true, total: true } });
  const outcome = row ? "already_present" : "added";
  const amountExGst = new Decimal(SPM_HOURS).mul(SPM_DEFAULT_HOURLY_RATE).toNumber();
  if (!row) row = await tx.costEstimate.create({
    data: { inspectionId, category: "Other", description: SPM_LINE_DESCRIPTION, quantity: SPM_HOURS, unit: "hr", rate: SPM_DEFAULT_HOURLY_RATE, subtotal: amountExGst, total: amountExGst, contingency: 0, isEstimated: false, lineKind: SPM_LINE_KIND },
    select: { id: true, total: true },
  });
  await tx.auditLog.create({ data: {
    inspectionId, userId, entityType: "CostEstimate",
    action: outcome === "added" ? "SPM line added" : "SPM line add (already present)",
    changes: JSON.stringify({ costEstimateId: row.id, amountExGst: Number(row.total), outcome }),
  } });
  return { ...await snapshot(tx, inspectionId, country), outcome };
}

export async function removeSpmRow(tx: Prisma.TransactionClient, inspectionId: string, userId: string) {
  await lockInspection(tx, inspectionId);
  const country = await countryAfterLock(tx, inspectionId);
  const row = await tx.costEstimate.findFirst({ where: { inspectionId, lineKind: SPM_LINE_KIND }, select: { id: true, total: true } });
  const removed = await tx.costEstimate.deleteMany({ where: { inspectionId, lineKind: SPM_LINE_KIND } });
  const outcome = removed.count ? "removed" : "absent";
  await tx.auditLog.create({ data: {
    inspectionId, userId, entityType: "CostEstimate",
    action: removed.count ? "SPM line removed" : "SPM line remove (absent)",
    changes: JSON.stringify({ costEstimateId: row?.id ?? null, amountExGst: row ? Number(row.total) : 0, outcome }),
  } });
  return { ...await snapshot(tx, inspectionId, country), outcome, note: "If this estimate was already sent to Xero or an insurer system, update or void it there." };
}
