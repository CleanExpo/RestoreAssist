/**
 * RA-8457 — the one owner of contractor certification verification.
 *
 * A contractor certification is created PENDING. Only a RestoreAssist
 * platform operator may move it to VERIFIED or REJECTED; the public
 * directory, the public profile and the homeowner portal show VERIFIED
 * certifications only.
 *
 * `ContractorProfile.isVerified` is derived here and nowhere else: a profile
 * is verified while it holds at least one VERIFIED certification that has not
 * passed its expiry date. Every writer that can change that answer (the admin
 * decision route, a contractor deleting a certification) calls
 * `syncProfileVerified` in the same transaction.
 *
 * Known limit: nothing re-runs the rule when an expiry date passes with no
 * write. Readers that care about expiry already filter on it.
 */
import type { Prisma } from "@prisma/client";

export const CERTIFICATION_DECISIONS = ["VERIFIED", "REJECTED"] as const;
export type CertificationDecision = (typeof CERTIFICATION_DECISIONS)[number];

export function isCertificationDecision(
  value: unknown,
): value is CertificationDecision {
  return (
    typeof value === "string" &&
    (CERTIFICATION_DECISIONS as readonly string[]).includes(value)
  );
}

/** The Prisma filter for "a certification that makes its profile verified". */
export function currentVerifiedCertificationWhere(
  now: Date,
): Prisma.ContractorCertificationWhereInput {
  return {
    verificationStatus: "VERIFIED",
    OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
  };
}

/**
 * Recompute and store `ContractorProfile.isVerified` (and `verifiedAt`) from
 * the profile's certifications. Call inside the transaction that changed
 * them. `verifiedAt` keeps its first value while the profile stays verified.
 */
export async function syncProfileVerified(
  tx: Prisma.TransactionClient,
  profileId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const count = await tx.contractorCertification.count({
    where: { profileId, ...currentVerifiedCertificationWhere(now) },
  });
  const isVerified = count > 0;
  const profile = await tx.contractorProfile.findUnique({
    where: { id: profileId },
    select: { isVerified: true },
  });
  if (profile && profile.isVerified !== isVerified) {
    await tx.contractorProfile.update({
      where: { id: profileId },
      data: { isVerified, verifiedAt: isVerified ? now : null },
    });
  }
  return isVerified;
}
