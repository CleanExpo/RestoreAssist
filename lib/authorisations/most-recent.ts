import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: MostRecentAuthorisation | null;
}

const cache = new Map<string, CacheEntry>();

export interface MostRecentAuthorisation {
  subjectLicenceNumber: string | null;
  subjectLicenceState: string | null;
  subjectLicenceClass: string | null;
  whsCardNumber: string | null;
  publicLiabilityInsurer: string | null;
  publicLiabilityPolicyNumber: string | null;
  publicLiabilityCoverAmount: { toString(): string } | null;
  verifiedAt: Date;
}

export async function mostRecentAuthorisationForUser(
  userId: string,
): Promise<MostRecentAuthorisation | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const row = await prisma.authorisation.findFirst({
    where: { subjectUserId: userId },
    orderBy: { verifiedAt: "desc" },
    select: {
      subjectLicenceNumber: true,
      subjectLicenceState: true,
      subjectLicenceClass: true,
      whsCardNumber: true,
      publicLiabilityInsurer: true,
      publicLiabilityPolicyNumber: true,
      publicLiabilityCoverAmount: true,
      verifiedAt: true,
    },
  });

  cache.set(userId, { expiresAt: now + CACHE_TTL_MS, value: row });
  return row;
}

export function invalidateAuthorisationCache(userId: string): void {
  cache.delete(userId);
}

/** @internal — for unit tests only */
export function _resetCacheForTests(): void {
  cache.clear();
}
