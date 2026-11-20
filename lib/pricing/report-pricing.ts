/**
 * RA-7893 — the pricing a report's generated documents (scope of works, cost
 * estimation) are priced at.
 *
 * - The creator owns the report's business, or has no organisation: their
 *   own pricing row, exactly as before.
 * - The creator is an invited member: the pricing of the organisation the
 *   report belongs to (getResourceTenant), then that organisation owner's
 *   legacy row. Keyed by the organisation, not the owner: one owner may own
 *   several organisations with different rates.
 * - The report's business cannot be proven: refused. Nothing is priced.
 */
import { prisma } from "@/lib/prisma";
import { getResourceTenant } from "@/lib/organization-credits";

type OrgOrLegacyPricing =
  | Awaited<ReturnType<typeof prisma.organizationPricingConfig.findUnique>>
  | Awaited<ReturnType<typeof prisma.companyPricingConfig.findUnique>>;

export type ReportPricing<T> =
  | { ok: true; pricingConfig: T | OrgOrLegacyPricing }
  | { ok: false };

export async function resolveReportPricing<T>(
  creatorId: string,
  ownPricingConfig: T | null,
  reportCreatedAt: Date,
): Promise<ReportPricing<T>> {
  const tenant = await getResourceTenant(creatorId, reportCreatedAt);
  if (!tenant) return { ok: false };
  if (tenant.ownerId === creatorId) {
    return { ok: true, pricingConfig: ownPricingConfig };
  }
  if (!tenant.organizationId) return { ok: false };

  const orgConfig = await prisma.organizationPricingConfig.findUnique({
    where: { organizationId: tenant.organizationId },
  });
  return {
    ok: true,
    pricingConfig:
      orgConfig ??
      (await prisma.companyPricingConfig.findUnique({
        where: { userId: tenant.ownerId },
      })),
  };
}
