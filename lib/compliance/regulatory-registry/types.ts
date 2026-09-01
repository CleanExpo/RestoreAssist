/**
 * The shape every regulatory claim in RestoreAssist must take.
 *
 * The point of the required fields is that a regulation cannot enter the
 * product as prose. On 2026-09-01 the codebase held three different answers to
 * one asbestos question -- pre-1990 in nine files, pre-1987 in the NSW
 * jurisdictional matrix, pre-2004 in the notification gate -- and the wrong ones
 * were the safety-critical ones. Nothing caught it because a regulation stated
 * in a string is indistinguishable from a regulation that was checked.
 *
 * So: instrument, source, and a date it was verified, or it does not ship.
 */

/** Domains the registry covers. Adding one is a deliberate act, not a typo. */
export const REGULATORY_DOMAINS = [
  "asbestos",
  "silica",
  "electrical",
  "chemicals",
  "building-code",
] as const;

export type RegulatoryDomain = (typeof REGULATORY_DOMAINS)[number];

/** AU states and territories, plus the two national scopes. */
export const REGULATORY_JURISDICTIONS = [
  "AU",
  "NZ",
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
] as const;

export type RegulatoryJurisdiction = (typeof REGULATORY_JURISDICTIONS)[number];

/**
 * How the entry was checked. This field exists to keep an environment
 * limitation auditable instead of hidden.
 *
 * - `primary-source`  the regulator's or legislature's own page was opened.
 * - `secondary-quoting-primary`  a source quoting the regulator was read, because
 *   the primary domain was unreachable. Weaker, and must be visible as such.
 * - `owner-confirmed`  a human with the licensed document or legal advice
 *   confirmed it.
 */
export const VERIFICATION_KINDS = [
  "primary-source",
  "secondary-quoting-primary",
  "owner-confirmed",
] as const;

export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export interface RegulatoryEntry {
  /** Stable dotted id, e.g. "asbestos.presumption-year.au". Cited by documents. */
  id: string;
  domain: RegulatoryDomain;
  jurisdiction: RegulatoryJurisdiction;
  /** The Act, Regulation, Code or Standard that carries the rule. */
  instrument: string;
  /** Section, regulation or chapter, where the rule sits at one. */
  provision?: string;
  /**
   * When the rule commenced, AT THE PRECISION ACTUALLY ESTABLISHED.
   *
   * One of `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. A shorter form is a positive
   * claim about what is known, not a placeholder to be padded out.
   *
   * This began as "ISO date the rule commenced", and entries whose day was
   * never established were written as the first of the month or the first of
   * the year to satisfy it. That is worse than it looks: `2023-11-01` asserts
   * a commencement day nobody verified, and any date-sensitive lookup reads it
   * as exact -- so a rule could be reported in force three weeks before it was.
   * Padding an unknown to fit a format is how a gap becomes a false fact.
   *
   * Compare with `effectiveFromRange()` rather than string ordering: a partial
   * value denotes an interval, and which end is the safe one depends on the
   * question being asked.
   */
  effectiveFrom: string;
  /**
   * The requirement IN OUR OWN WORDS.
   *
   * Never the instrument's wording: AS/NZS, ISO and IICRC text is copyrighted
   * and licensed, and `lib/standards/copyright-guard.ts` exists because of it.
   * An assessor wants the instrument, the clause and what it requires -- which
   * is what this field carries.
   */
  requirement: string;
  sourceUrl: string;
  /** ISO date this entry was last checked against its source. */
  verifiedAt: string;
  verification: VerificationKind;
  /** Set when a later entry replaces this one; keeps the history readable. */
  supersededBy?: string;
  /**
   * A machine-usable value where the rule reduces to one, e.g. the year before
   * which asbestos is presumed. Optional -- most rules are not a single number,
   * and forcing one is how a nuance becomes a wrong threshold.
   */
  value?: number | string;
}
