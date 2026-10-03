/**
 * RA-7893 — the pricing a report's generated documents (scope of works, cost
 * estimation) are priced at.
 *
 * - The creator owns the report's business, or has no organisation: their
 *   own pricing row, exactly as before.
 * - The creator is an invited member: the pricing of the business the report
 *   belongs to (getResourceTenantOwner): that business's organisation config,
 *   then its owner's legacy row. An invited member has no pricing row of
 *   their own, and must not price a job at one if they do.
 * - The report's business cannot be proven: refused. Nothing is priced.
 */
import { prisma } from "@/lib/prisma";
import { getResourceTenantOwner } from "@/lib/organization-credits";
import { resolveEffectivePricing } from "@/lib/pricing/effective-pricing";

export type ReportPricing<T> =
  | { ok: true; pricingConfig: T | Awaited<ReturnType<typeof resolveEffectivePricing>> }
  | { ok: false };

export async function resolveReportPricing<T>(
  creatorId: string,
  ownPricingConfig: T | null,
  reportCreatedAt: Date,
): Promise<ReportPricing<T>> {
  const tenantOwnerId = await getResourceTenantOwner(creatorId, reportCreatedAt);
  if (!tenantOwnerId) return { ok: false };
  if (tenantOwnerId === creatorId) {
    return { ok: true, pricingConfig: ownPricingConfig };
  }
  return {
    ok: true,
    pricingConfig: await resolveEffectivePricing(prisma, tenantOwnerId),
  };
}
