/**
 * When to presume lead-based paint from a building's age.
 *
 * The sibling of lib/compliance/asbestos-era.ts, and it exists for a defect that
 * sibling caused. `leadRisk` in lib/reports/build-structured-report.ts was set
 * from the ASBESTOS presumption year, because the registry had no lead domain to
 * read. CodeRabbit flagged it on PR #2164 and was right: a reader was shown an
 * asbestos-derived year as though it were a lead determination.
 *
 * The borrowed year over-warned rather than under-warned in both countries, so
 * nobody was put in danger by it. But conservative is not correct, and a borrowed
 * threshold cannot be cited to an assessor.
 *
 * LEAD IS NOT ASBESTOS. Australia banned asbestos in workplaces from
 * 31 December 2003, so the asbestos year rests on a ban with a commencement
 * date. Nothing equivalent happened for lead paint in either country: the
 * permitted concentration fell in steps and the regulators issue guidance to
 * PRESUME lead unless it is tested. So these are presumption years, never
 * prohibitions, and a later build year is not a clearance -- both instruments
 * say so explicitly.
 *
 * The jurisdiction ordering also REVERSES between the two domains, which is the
 * trap for anyone reasoning about lead by analogy with asbestos: Australia's
 * asbestos year is later than New Zealand's, while its lead year is earlier.
 * "AU is always the later one" is a false generalisation. The four numbers
 * themselves are deliberately not written here -- they live in the registry, and
 * a comment repeating them is a copy that can go stale silently. The test
 * "reverses the jurisdiction ordering between the two domains" in
 * regulatory-registry/__tests__/registry.test.ts pins the relationship instead.
 *
 * As with asbestos, this module does not own the dates. They live in
 * lib/compliance/regulatory-registry/lead.ts with their instrument, provision,
 * source and verification date, and `check:regulatory-registry` fails the build
 * if an entry loses its source or goes unchecked for a year.
 */
import { regulation, type RegulatoryEntry } from "./regulatory-registry";

/** Jurisdictions whose lead presumption year differs. */
export type LeadJurisdiction = "AU" | "NZ";

export const LEAD_PRESUMPTION_ENTRY_ID: Record<LeadJurisdiction, string> = {
  AU: "lead.presumption-year.au",
  NZ: "lead.presumption-year.nz",
};

/**
 * Presume lead-based paint in anything built BEFORE this year, read from the
 * registry so the number and its source cannot drift apart.
 *
 * Both instruments phrase the rule as "before" their year -- see each entry's
 * `requirement` for the exact wording -- so a simple `<` is the right comparison
 * and no off-by-one adjustment is needed. That is NOT true of the asbestos
 * years, which are deliberately set to the year AFTER each ban so the same `<`
 * works; do not copy the reasoning between the two modules.
 */
export const LEAD_PRESUMPTION_YEAR: Record<LeadJurisdiction, number> = {
  AU: Number(regulation(LEAD_PRESUMPTION_ENTRY_ID.AU).value),
  NZ: Number(regulation(LEAD_PRESUMPTION_ENTRY_ID.NZ).value),
};

export interface LeadEraBasis {
  year: number;
  /** The regulator or instrument behind the year, for the audit trail. */
  authority: string;
  /** One sentence a technician can act on. */
  guidance: string;
}

function basisFrom(entry: RegulatoryEntry): LeadEraBasis {
  return {
    year: Number(entry.value),
    authority: `${entry.instrument} (${entry.sourceUrl})`,
    guidance: entry.requirement,
  };
}

/**
 * Should this job presume lead-based paint from the building's age alone?
 *
 * Unknown year returns FALSE, matching presumeAsbestosFromEra: an unknown-age
 * building is not evidence of lead, and flagging every job with a blank field
 * would train technicians to dismiss the hazard.
 *
 * A FALSE HERE IS NOT A CLEARANCE, and callers must not present it as one. Both
 * instruments are explicit that buildings after the presumption year can still
 * carry lead where old, industrial or marine paints were used, and the New
 * Zealand guideline records evidence of lead paint on properties built in the
 * decade after its own year. Other bodies in both countries set the line later
 * again -- SA Health, the NHMRC and WorkSafe NZ's web guidance each state a
 * broader presumption than the instrument cited here, and every one of those
 * divergences is written into the entries' `requirement` text rather than
 * duplicated in this comment. Visible deteriorating paint, a test result, or a
 * build year shortly after the presumption year are each their own trigger.
 */
export function presumeLeadFromEra(
  yearBuilt: number | null | undefined,
  jurisdiction: LeadJurisdiction = "AU",
): boolean {
  if (yearBuilt == null || !Number.isFinite(yearBuilt)) return false;
  return yearBuilt < LEAD_PRESUMPTION_YEAR[jurisdiction];
}

/** The year, the authority behind it, and what to do — for prompts and documents. */
export function leadEraBasis(
  jurisdiction: LeadJurisdiction = "AU",
): LeadEraBasis {
  return basisFrom(regulation(LEAD_PRESUMPTION_ENTRY_ID[jurisdiction]));
}
