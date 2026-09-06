/**
 * What a client may see about the technician working in their home.
 *
 * Pure selection + redaction, kept out of the component so the rules are
 * testable without rendering. The portal is opened by the homeowner from a
 * token link, so everything here crosses a trust boundary: it is shown to
 * someone outside the organisation.
 */

/** Mirrors the Prisma `CertificationType` enum, loosely — only the prefix matters. */
export interface CertificationInput {
  certificationType: string;
  certificationName: string;
  issuingBody: string;
  certificationNumber: string | null;
  expiryDate: Date | null;
  verificationStatus: string;
}

export interface PublicCertification {
  certificationName: string;
  issuingBody: string;
  /** Null when the number must not be shown — see `isRegistryVerifiable`. */
  certificationNumber: string | null;
  expiryDate: Date | null;
}

/**
 * Whether a certification's NUMBER may be shown to the client.
 *
 * Competency certifications (IICRC, trades) are meant to be checked: the number
 * is how a homeowner looks the technician up on the issuing body's register,
 * which is the entire point of showing the credential at all.
 *
 * INSURANCE_* numbers are POLICY numbers. A public liability or workers'
 * compensation policy number is not a credential to verify, it is an account
 * identifier, and publishing it to every client of every job is a disclosure
 * nobody asked for. The client is told the cover is held and current — which is
 * what actually reassures them — without the number.
 *
 * BUSINESS_* is allowed through: an ABN is already public by design, and it is
 * the number a client is most likely to want to check.
 */
export function isRegistryVerifiable(certificationType: string): boolean {
  return !certificationType.startsWith("INSURANCE_");
}

/**
 * Select the certifications a client may see, and redact what they may not.
 *
 * Only VERIFIED survives. A PENDING certification is an unproven claim, and
 * showing one to a homeowner as evidence of competence is worse than showing
 * nothing — they cannot tell the difference, so they would reasonably read it as
 * checked. REJECTED, EXPIRED and RENEWAL_NEEDED are excluded for the same
 * reason.
 *
 * `expiryDate` is re-checked here rather than trusted from the status: a row can
 * sit at VERIFIED while its expiry quietly passes, because nothing rewrites the
 * status on a timer. Presenting a lapsed credential as current is exactly the
 * misrepresentation this card exists to avoid.
 */
export function selectPublicCertifications(
  certifications: readonly CertificationInput[],
  now: Date = new Date(),
): PublicCertification[] {
  return certifications
    .filter((c) => c.verificationStatus === "VERIFIED")
    .filter((c) => c.expiryDate === null || c.expiryDate > now)
    .map((c) => ({
      certificationName: c.certificationName,
      issuingBody: c.issuingBody,
      certificationNumber: isRegistryVerifiable(c.certificationType)
        ? c.certificationNumber
        : null,
      expiryDate: c.expiryDate,
    }));
}

/** Initials for the photo fallback. Never more than two letters. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
