/**
 * RA-7026 Phase 1.5 — single source of truth for a contractor's pricing.
 *
 * The bug this closes: the setup wizard writes `OrganizationPricingConfig`
 * (keyed by organizationId) and Margot reads it, but every estimator
 * (rate-engine, /api/calculate, nir-cost-estimation) read
 * `CompanyPricingConfig` (keyed by userId). In prod that user table has ~1 row
 * across 90 orgs, so estimators silently fall through to fallback rates while
 * Margot quotes the org's real rates — the two disagree for the same job.
 *
 * `resolveEffectivePricing` makes the ORG config authoritative for BOTH surfaces:
 *   1. OrganizationPricingConfig[user.organizationId]  (setup truth)
 *   2. CompanyPricingConfig[userId]                    (legacy per-user fallback)
 *   3. null → caller keeps its own CostDatabase/NRPG fallback chain (decision D4)
 *
 * The two Prisma models are field-identical for every charge-out field (only
 * the tenancy key differs; CompanyPricingConfig additionally has
 * `electricityRatePer24h`, which none of the repointed readers use), so the
 * union return type is a drop-in for the existing `companyPricingConfig`
 * fetches without a field remap.
 */

import type {
  PrismaClient,
  OrganizationPricingConfig,
  CompanyPricingConfig,
} from "@prisma/client";

/**
 * Either table's row — callers only read fields common to both (all charge-out
 * rates, fees and multipliers), so the union is safe to access directly.
 */
export type EffectivePricing = OrganizationPricingConfig | CompanyPricingConfig;

/** Minimal Prisma surface — lets tests pass a stub without the full client. */
export type PricingResolverClient = Pick<
  PrismaClient,
  "user" | "organizationPricingConfig" | "companyPricingConfig"
>;

/**
 * The contractor's effective pricing: org config (authoritative) → legacy
 * user config → null. Returning null is a signal, not a failure — the caller
 * applies its existing CostDatabase/NRPG fallback.
 */
export async function resolveEffectivePricing(
  prisma: PricingResolverClient,
  userId: string,
): Promise<EffectivePricing | null> {
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });

  if (user?.organizationId) {
    const orgConfig = await prisma.organizationPricingConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (orgConfig) return orgConfig;
  }

  return prisma.companyPricingConfig.findUnique({ where: { userId } });
}
