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
 * Verified 2026-09-01 against the regulators, not against the codebase:
 *   AU -- all asbestos prohibited in Australian workplaces from 31 December
 *         2003; buildings constructed before that date require an asbestos
 *         survey, and a register plus management plan where ACM is found.
 *         (Safe Work Australia)
 *   NZ -- assume any building constructed OR RENOVATED before 1 January 2000
 *         may contain asbestos; a PCBU must hold an asbestos management plan
 *         for a building constructed prior to 2000.
 *         (WorkSafe New Zealand; Health and Safety at Work (Asbestos)
 *         Regulations 2016)
 *
 * The two dates differ because the two bans differ. Do not collapse them.
 */

/** Jurisdictions whose asbestos presumption year differs. */
export type AsbestosJurisdiction = "AU" | "NZ";

/**
 * Presume ACM in anything built BEFORE this year.
 *
 * Deliberately the year after each ban so the comparison stays a simple `<`:
 * Australia's ban took effect 31 December 2003, so a 2003 build is still in
 * scope; New Zealand's threshold is stated by WorkSafe as 1 January 2000.
 */
export const ASBESTOS_PRESUMPTION_YEAR: Record<AsbestosJurisdiction, number> = {
  AU: 2004,
  NZ: 2000,
};

export interface AsbestosEraBasis {
  year: number;
  /** The regulator or instrument behind the year, for the audit trail. */
  authority: string;
  /** One sentence a technician can act on. */
  guidance: string;
}

const BASIS: Record<AsbestosJurisdiction, AsbestosEraBasis> = {
  AU: {
    year: ASBESTOS_PRESUMPTION_YEAR.AU,
    authority:
      "Safe Work Australia — all asbestos prohibited in Australian workplaces from 31 December 2003",
    guidance:
      "Treat any building constructed before 2004 as possibly containing asbestos until tested. Check the asbestos register first; if a material cannot be tested, assume it is asbestos.",
  },
  NZ: {
    year: ASBESTOS_PRESUMPTION_YEAR.NZ,
    authority:
      "WorkSafe New Zealand — Health and Safety at Work (Asbestos) Regulations 2016",
    guidance:
      "Treat any building constructed or renovated before 2000 as possibly containing asbestos until tested. A PCBU must hold an asbestos management plan for a pre-2000 building.",
  },
};

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
  return BASIS[jurisdiction];
}
