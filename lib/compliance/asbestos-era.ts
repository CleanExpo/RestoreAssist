/**
 * When to presume asbestos-containing materials from a building's age.
 *
 * This existed in the codebase three times with two different answers, and the
 * safety-critical copies had the wrong one:
 *
 *   lib/compliance/safework-notification-gate.ts   pre-2004 AU / pre-2000 NZ  (right)
 *   lib/swms/auto-generator.ts                     pre-1990                   (wrong)
 *   lib/ai/claim-type-prompts.ts                   pre-1990                   (wrong)
 *   lib/restoration/ppe-requirements.ts            pre-1990                   (wrong)
 *
 * So a 1995 building produced a Safe Work Method Statement with NO asbestos
 * hazard on it, and a test pinned that behaviour ("does NOT include
 * asbestos_risk for post-1990 building", fixture year 1995).
 *
 * Where 1990 came from: Queensland alone exempts buildings built after
 * 31 December 1989 from the asbestos REGISTER requirement. That is a register
 * rule in one state, not a national answer to "could this building contain
 * asbestos" -- and it was applied to every job in the country.
 *
 * THIS MODULE NO LONGER OWNS THE DATES. They live in
 * lib/compliance/regulatory-registry/asbestos.ts with their instrument, source
 * and verification date, and `check:regulatory-registry` fails the build if an
 * entry loses its source or goes unchecked for a year. This module is the
 * ergonomic front door: the question callers actually ask is "should I presume
 * asbestos on this job", not "what does the register rule say".
 */
import {
  regulation,
  type RegulatoryEntry,
} from "./regulatory-registry";

/** Jurisdictions whose asbestos presumption year differs. */
export type AsbestosJurisdiction = "AU" | "NZ";

/**
 * Presume ACM in anything built BEFORE this year.
 *
 * Deliberately the year after each ban so the comparison stays a simple `<`:
 * Australia's ban took effect 31 December 2003, so a 2003 build is still in
 * scope; New Zealand's threshold is stated by WorkSafe as 1 January 2000.
 */
export const ASBESTOS_PRESUMPTION_ENTRY_ID: Record<
  AsbestosJurisdiction,
  string
> = {
  AU: "asbestos.presumption-year.au",
  NZ: "asbestos.presumption-year.nz",
};

/**
 * Presume ACM in anything built BEFORE this year, read from the registry.
 *
 * The two dates differ because the two bans differ -- Australia's took effect
 * 31 December 2003, New Zealand's threshold is 1 January 2000. Do not collapse
 * them.
 */
export const ASBESTOS_PRESUMPTION_YEAR: Record<AsbestosJurisdiction, number> = {
  AU: Number(regulation(ASBESTOS_PRESUMPTION_ENTRY_ID.AU).value),
  NZ: Number(regulation(ASBESTOS_PRESUMPTION_ENTRY_ID.NZ).value),
};

export interface AsbestosEraBasis {
  year: number;
  /** The regulator or instrument behind the year, for the audit trail. */
  authority: string;
  /** One sentence a technician can act on. */
  guidance: string;
}

function basisFrom(entry: RegulatoryEntry): AsbestosEraBasis {
  return {
    year: Number(entry.value),
    authority: `${entry.instrument} (${entry.sourceUrl})`,
    guidance: entry.requirement,
  };
}

/**
 * Should this job presume asbestos from the building's age alone?
 *
 * Unknown year returns FALSE, which is the honest answer rather than the safe
 * one: an unknown-age building is not evidence of asbestos, and flagging every
 * job with a blank field would train technicians to dismiss the hazard. The
 * age presumption is one input; a visual identification or a register entry is
 * a separate and stronger trigger, and callers must not treat this as the only
 * asbestos check.
 */
export function presumeAsbestosFromEra(
  yearBuilt: number | null | undefined,
  jurisdiction: AsbestosJurisdiction = "AU",
): boolean {
  if (yearBuilt == null || !Number.isFinite(yearBuilt)) return false;
  return yearBuilt < ASBESTOS_PRESUMPTION_YEAR[jurisdiction];
}

/** The year, the authority behind it, and what to do — for prompts and documents. */
export function asbestosEraBasis(
  jurisdiction: AsbestosJurisdiction = "AU",
): AsbestosEraBasis {
  return basisFrom(regulation(ASBESTOS_PRESUMPTION_ENTRY_ID[jurisdiction]));
}
