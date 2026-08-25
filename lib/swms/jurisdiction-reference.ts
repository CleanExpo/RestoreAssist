/**
 * The SWMS "Reference Material" table - which safety instrument applies where.
 *
 * This is the section of a SWMS most likely to be wrong and least likely to be
 * noticed. UNI-2619 was exactly that failure in the report generator: a string
 * operation dropped every jurisdiction's year and rendered Victoria under a
 * Work Health and Safety Act it has never had.
 *
 * So the eight Australian state and territory rows are NOT literals here. Act
 * and regulator are read from `getStateInfo` in `lib/state-detection.ts`, which
 * is the single place the application records jurisdictional law. Correcting a
 * citation there corrects it in reports and in SWMS together, and a SWMS cannot
 * drift away from the report it accompanies.
 *
 * The Commonwealth and New Zealand rows ARE literals, because `getStateInfo`
 * has no entry for either. That gap is tracked separately: a New Zealand job
 * currently gets `null` from `getStateInfo`, which is why this module carries
 * NZ explicitly rather than pretending detection covers it.
 */
import { getStateInfo } from "@/lib/state-detection";

export interface SwmsJurisdiction {
  /** "NSW", "VIC", ..., plus "CTH" and "NZ". */
  code: string;
  name: string;
  /** Principal safety Act, with jurisdiction suffix. */
  act: string;
  /** Principal regulation. `null` where the jurisdiction names none. */
  regulation: string | null;
  regulator: string;
  codesOfPractice: string;
  /**
   * True for jurisdictions that adopted the model WHS laws. Victoria did not
   * (it runs the Occupational Health and Safety Act 2004), and New Zealand runs
   * its own Health and Safety at Work Act 2015.
   */
  harmonised: boolean;
}

/** Australian states and territories, in the order the source documents list them. */
const AU_CODES = ["NSW", "ACT", "QLD", "NT", "SA", "TAS", "VIC", "WA"] as const;

/**
 * Regulation and codes-of-practice text, keyed by jurisdiction.
 *
 * Regulations are not modelled in `StateInfo`, so they live here. Where the
 * source documents and the current instrument disagree the current instrument
 * wins: the source SWMS cite a "Work Health and Safety Act 2022 (WA)", but
 * Western Australia's Act is the Work Health and Safety Act 2020 (WA) - 2022 is
 * the year its regulations were made and the Act commenced.
 */
const REGULATION_BY_CODE: Record<string, { regulation: string | null; codes: string }> = {
  NSW: {
    regulation: "Work Health and Safety Regulation 2017 (NSW)",
    codes: "NSW Codes of Practice",
  },
  ACT: {
    regulation: "Work Health and Safety Regulation 2011 (ACT)",
    codes: "ACT Codes of Practice",
  },
  QLD: {
    regulation: "Work Health and Safety Regulation 2011 (Qld)",
    codes: "Qld Codes of Practice",
  },
  NT: {
    regulation:
      "Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT)",
    codes: "NT Codes of Practice",
  },
  SA: {
    regulation: "Work Health and Safety Regulations 2012 (SA)",
    codes: "SA Codes of Practice",
  },
  TAS: {
    regulation: "Work Health and Safety Regulations 2012 (Tas)",
    codes: "Tas Codes of Practice",
  },
  VIC: {
    regulation: "Occupational Health and Safety Regulations 2017 (Vic)",
    codes: "Vic Compliance Codes",
  },
  WA: {
    regulation: "Work Health and Safety (General) Regulations 2022 (WA)",
    codes: "WA Codes of Practice",
  },
};

/** Jurisdictions with no `getStateInfo` entry, carried as literals. */
const NON_STATE_JURISDICTIONS: readonly SwmsJurisdiction[] = [
  {
    code: "CTH",
    name: "Commonwealth",
    act: "Work Health and Safety Act 2011 (Cth)",
    regulation: "Work Health and Safety Regulations 2011 (Cth)",
    regulator: "Comcare",
    codesOfPractice: "Safe Work Australia Codes of Practice",
    harmonised: true,
  },
  {
    code: "NZ",
    name: "New Zealand",
    act: "Health and Safety at Work Act 2015 (NZ)",
    regulation: null,
    regulator: "WorkSafe New Zealand",
    codesOfPractice: "NZ Codes of Practice",
    harmonised: false,
  },
];

/**
 * Every jurisdiction row for the SWMS reference table.
 *
 * Throws if `getStateInfo` stops resolving a code this module expects, rather
 * than silently emitting a SWMS with a jurisdiction missing.
 */
export function getSwmsJurisdictions(): SwmsJurisdiction[] {
  const states = AU_CODES.map((code) => {
    const info = getStateInfo(code);
    if (!info) {
      throw new Error(
        `SWMS reference table: getStateInfo("${code}") returned null. ` +
          "Jurisdictional law is resolved from lib/state-detection.ts and cannot be defaulted.",
      );
    }
    const reg = REGULATION_BY_CODE[code];
    return {
      code,
      name: info.name,
      act: info.whsAct,
      regulation: reg.regulation,
      regulator: info.workSafetyAuthority,
      codesOfPractice: reg.codes,
      // Victoria never adopted the model WHS laws; every other state and
      // territory did. Derived from the Act itself, not hardcoded per state.
      harmonised: info.whsAct.startsWith("Work Health and Safety"),
    } satisfies SwmsJurisdiction;
  });

  return [...states, ...NON_STATE_JURISDICTIONS];
}

/**
 * The single jurisdiction row that applies to a job, or `null` if the code is
 * not one this module covers. Callers must handle `null` — emitting a SWMS with
 * no applicable law is worse than emitting none.
 */
export function getSwmsJurisdiction(code: string): SwmsJurisdiction | null {
  const wanted = code.toUpperCase();
  return getSwmsJurisdictions().find((j) => j.code === wanted) ?? null;
}

/**
 * AS/NZS standards the source documents reference across all activities.
 */
export const SWMS_AUS_NZ_STANDARDS: readonly string[] = [
  "AS/NZS 1892.1-5 series - Portable ladders",
  "AS 1657 - Fixed platforms, walkways, stairways and ladders",
  "AS/NZS 1269 - Occupational noise management",
  "AS/NZS 3760 - In-service safety inspection and testing of electrical equipment",
  "AS/NZS 3012 - Electrical installations: construction and demolition sites",
  "AS/NZS 2210.3 - Occupational protective footwear",
];
