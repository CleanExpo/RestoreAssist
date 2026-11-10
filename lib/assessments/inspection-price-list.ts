/**
 * RA-8281 review (P1-ASSESSMENT-PRICING-USES-ACTOR): the price list an
 * assessment is priced at.
 *
 * It belongs to the business that owns the inspection, by the RA-7893 rule
 * every report document already follows (resolveReportPricing): the
 * creator's own pricing when they own the business, otherwise the
 * organisation's pricing and then its owner's legacy row. It is never the
 * pricing of whoever clicks Generate, so a colleague regenerating a claim
 * cannot change its charge-out amounts.
 *
 * Null means there is no usable price list: the inspection's business cannot
 * be proven, or it has no saved pricing. Callers then price nothing, every
 * line reads "rate not set" and the total is blocked. Never a default rate.
 */
import { prisma } from "@/lib/prisma";
import {
  resolveEffectivePricing,
  type EffectivePricing,
} from "@/lib/pricing/effective-pricing";
import { resolveReportPricing } from "@/lib/pricing/report-pricing";

/** The inspection fields that name its business: creator and creation time. */
export interface InspectionBusinessRef {
  userId: string;
  createdAt: Date;
}

export async function resolveInspectionPriceList(
  inspection: InspectionBusinessRef,
): Promise<EffectivePricing | null> {
  if (!inspection.userId || !(inspection.createdAt instanceof Date)) {
    return null;
  }
  const own = await resolveEffectivePricing(prisma, inspection.userId);
  const pricing = await resolveReportPricing(
    inspection.userId,
    own,
    inspection.createdAt,
  );
  if (!pricing.ok) return null;
  return pricing.pricingConfig ?? null;
}
