// State / region / country detection and regulatory framework utilities.
//
// RestoreAssist is an AU + NZ platform. AU detection is the long-standing
// default and MUST NOT change behaviour. NZ support is additive — callers
// opt in by passing `countryHint: "NZ"` when they know the address is NZ
// (e.g. a tenant flagged as NZ, or an address captured with country = NZ).
//
// Without a hint, `detectCountry` is conservative:
//   - Returns "AU" when the postcode falls in any AU range (preserves the
//     existing default — AU is the majority of traffic).
//   - Returns "NZ" only when the postcode is NZ-unique (i.e. not also a
//     valid AU postcode).
//   - Returns null when the postcode matches neither.
//
// Callers that cannot tolerate ambiguity should always pass `countryHint`.

export type Country = "AU" | "NZ";

export type NZRegion =
  | "Northland"
  | "Auckland"
  | "Waikato"
  | "BayOfPlenty"
  | "Gisborne"
  | "HawkesBay"
  | "Taranaki"
  | "ManawatuWhanganui"
  | "Wellington"
  | "TasmanNelsonMarlborough"
  | "WestCoast"
  | "Canterbury"
  | "Otago"
  | "Southland";

export interface StateInfo {
  code: string;
  name: string;
  buildingAuthority: string;
  workSafetyAuthority: string;
  epaAuthority: string;
  buildingCode: string;
  whsAct: string;
  epaAct: string;
  workSafetyContact: string;
  epaContact: string;
}

// Postcode ranges for Australian states/territories (simplified - actual ranges are more complex)
const POSTCODE_RANGES: { [key: string]: number[][] } = {
  NSW: [
    [1000, 2599],
    [2619, 2899],
    [2921, 2999],
  ],
  VIC: [
    [3000, 3999],
    [8000, 8999],
  ],
  QLD: [
    [4000, 4999],
    [9000, 9999],
  ],
  SA: [[5000, 5999]],
  WA: [[6000, 6799]],
  TAS: [[7000, 7999]],
  ACT: [
    [200, 299],
    [2600, 2618],
    [2900, 2920],
  ],
  NT: [[800, 999]],
};

// NZ region postcode ranges (4 digits, NZ Post). Several ranges overlap
// each other (e.g. Canterbury subsumes Tasman/Nelson/Marlborough and the
// West Coast); `detectNZRegion` resolves by scanning narrower regions
// first so the more specific match wins.
const NZ_POSTCODE_RANGES: { region: NZRegion; ranges: number[][] }[] = [
  { region: "Northland", ranges: [[100, 299]] },
  { region: "Auckland", ranges: [[600, 2699]] },
  { region: "BayOfPlenty", ranges: [[3000, 3199]] },
  { region: "Waikato", ranges: [[3200, 3999]] },
  { region: "Gisborne", ranges: [[4000, 4099]] },
  { region: "HawkesBay", ranges: [[4100, 4299]] },
  { region: "Taranaki", ranges: [[4300, 4399]] },
  { region: "ManawatuWhanganui", ranges: [[4400, 4999]] },
  { region: "Wellington", ranges: [[5000, 6999]] },
  // Tasman/Nelson/Marlborough and West Coast both sit inside the broader
  // 7000-7999 band that Canterbury also claims; list the narrower ones
  // first so they win before falling back to Canterbury.
  { region: "TasmanNelsonMarlborough", ranges: [[7000, 7299]] },
  { region: "WestCoast", ranges: [[7800, 7899]] },
  { region: "Canterbury", ranges: [[7300, 7999]] },
  { region: "Otago", ranges: [[9000, 9499]] },
  { region: "Southland", ranges: [[9500, 9999]] },
];

function parsePostcode(postcode: string): number | null {
  if (!postcode) return null;
  const numeric = parseInt(postcode.replace(/\D/g, ""), 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function isInAURange(numeric: number): boolean {
  for (const ranges of Object.values(POSTCODE_RANGES)) {
    for (const [min, max] of ranges) {
      if (numeric >= min && numeric <= max) return true;
    }
  }
  return false;
}

function isInNZRange(numeric: number): boolean {
  for (const { ranges } of NZ_POSTCODE_RANGES) {
    for (const [min, max] of ranges) {
      if (numeric >= min && numeric <= max) return true;
    }
  }
  return false;
}

/**
 * Detects the Australian state/territory for a postcode. AU-only behaviour
 * — unchanged since the platform launched. For NZ detection use
 * `detectNZRegion`; for multi-country routing use `detectCountry`.
 */
export function detectStateFromPostcode(postcode: string): string | null {
  const numericPostcode = parsePostcode(postcode);
  if (numericPostcode === null) return null;

  for (const [state, ranges] of Object.entries(POSTCODE_RANGES)) {
    for (const [min, max] of ranges) {
      if (numericPostcode >= min && numericPostcode <= max) {
        return state;
      }
    }
  }

  return null;
}

/**
 * Detects the country ("AU" or "NZ") from a postcode. If `countryHint` is
 * provided, it is trusted and the postcode is validated against that
 * country's ranges (returns the hint on match, otherwise null).
 *
 * Without a hint, AU takes precedence: any postcode that falls in an AU
 * range returns "AU" (preserves existing behaviour for the AU majority).
 * Postcodes that only match an NZ range return "NZ". If neither country
 * matches, returns null.
 */
export function detectCountry(
  postcode: string,
  countryHint?: Country,
): Country | null {
  const numeric = parsePostcode(postcode);
  if (numeric === null) return null;

  if (countryHint === "AU") {
    return isInAURange(numeric) ? "AU" : null;
  }
  if (countryHint === "NZ") {
    return isInNZRange(numeric) ? "NZ" : null;
  }

  if (isInAURange(numeric)) return "AU";
  if (isInNZRange(numeric)) return "NZ";
  return null;
}

/**
 * Detects the NZ region for a postcode. Returns null if the postcode is
 * not in any NZ range. Note: many NZ postcodes overlap AU ranges (e.g.
 * 3000–3999 is valid in both Australia and NZ); callers that want to
 * guard against AU postcodes should use `detectCountry(postcode, "NZ")`
 * first.
 */
export function detectNZRegion(postcode: string): NZRegion | null {
  const numeric = parsePostcode(postcode);
  if (numeric === null) return null;

  for (const { region, ranges } of NZ_POSTCODE_RANGES) {
    for (const [min, max] of ranges) {
      if (numeric >= min && numeric <= max) {
        return region;
      }
    }
  }
  return null;
}

export function getStateInfo(stateCode: string | null): StateInfo | null {
  if (!stateCode) return null;

  const frameworks: { [key: string]: StateInfo } = {
    QLD: {
      code: "QLD",
      name: "Queensland",
      buildingAuthority:
        "Queensland Building and Construction Commission (QBCC)",
      buildingCode: "QDC 4.5 (Queensland Development Code)",
      workSafetyAuthority: "WorkSafe QLD",
      workSafetyContact: "1300 362 128",
      epaAuthority: "EPA Queensland",
      epaContact: "13 QGOV (13 74 68)",
      whsAct: "Work Health and Safety Act 2011 (Qld)",
      epaAct: "Environmental Protection Act 1994 (Qld)",
    },
    NSW: {
      code: "NSW",
      name: "New South Wales",
      buildingAuthority: "NSW Fair Trading",
      buildingCode: "BCA (Building Code of Australia) + NSW Building Code",
      workSafetyAuthority: "SafeWork NSW",
      workSafetyContact: "13 10 50",
      epaAuthority: "EPA NSW",
      epaContact: "131 555",
      whsAct: "Work Health and Safety Act 2011 (NSW)",
      epaAct: "Protection of the Environment Operations Act 1997 (NSW)",
    },
    VIC: {
      code: "VIC",
      name: "Victoria",
      buildingAuthority: "Victorian Building Authority (VBA)",
      buildingCode: "BCA + Victorian Building Regulations",
      workSafetyAuthority: "WorkSafe Victoria",
      workSafetyContact: "1800 136 089",
      epaAuthority: "EPA Victoria",
      epaContact: "1300 372 842",
      whsAct: "Occupational Health and Safety Act 2004 (Vic)",
      epaAct: "Environment Protection Act 2017 (Vic)",
    },
    SA: {
      code: "SA",
      name: "South Australia",
      buildingAuthority: "Consumer and Business Services (CBS)",
      buildingCode: "BCA + South Australian Building Regulations",
      workSafetyAuthority: "SafeWork SA",
      workSafetyContact: "1300 365 255",
      epaAuthority: "EPA South Australia",
      epaContact: "(08) 8204 2004",
      whsAct: "Work Health and Safety Act 2012 (SA)",
      epaAct: "Environment Protection Act 1993 (SA)",
    },
    WA: {
      code: "WA",
      name: "Western Australia",
      buildingAuthority:
        "Building and Energy (Department of Mines, Industry Regulation and Safety)",
      buildingCode: "BCA + Western Australian Building Regulations",
      workSafetyAuthority: "WorkSafe WA",
      workSafetyContact: "1300 307 877",
      epaAuthority: "Department of Water and Environmental Regulation (DWER)",
      epaContact: "(08) 6364 7000",
      whsAct: "Work Health and Safety Act 2020 (WA)",
      epaAct: "Environmental Protection Act 1986 (WA)",
    },
    TAS: {
      code: "TAS",
      name: "Tasmania",
      buildingAuthority: "Consumer, Building and Occupational Services (CBOS)",
      buildingCode: "BCA + Tasmanian Building Regulations",
      workSafetyAuthority: "WorkSafe Tasmania",
      workSafetyContact: "1300 366 322",
      epaAuthority: "EPA Tasmania",
      epaContact: "(03) 6165 4599",
      whsAct: "Work Health and Safety Act 2012 (Tas)",
      epaAct: "Environmental Management and Pollution Control Act 1994 (Tas)",
    },
    ACT: {
      code: "ACT",
      name: "Australian Capital Territory",
      buildingAuthority: "ACT Planning and Land Authority",
      buildingCode: "BCA + ACT Building Code",
      workSafetyAuthority: "WorkSafe ACT",
      workSafetyContact: "02 6207 3000",
      epaAuthority:
        "Environment, Planning and Sustainable Development Directorate",
      epaContact: "13 22 81",
      whsAct: "Work Health and Safety Act 2011 (ACT)",
      epaAct: "Environment Protection Act 1997 (ACT)",
    },
    NT: {
      code: "NT",
      name: "Northern Territory",
      buildingAuthority:
        "Building Advisory Services (Department of Infrastructure, Planning and Logistics)",
      buildingCode: "BCA + Northern Territory Building Regulations",
      workSafetyAuthority: "NT WorkSafe",
      workSafetyContact: "1800 019 115",
      epaAuthority: "Department of Environment, Parks and Water Security",
      epaContact: "(08) 8999 5511",
      whsAct:
        "Work Health and Safety (National Uniform Legislation) Act 2011 (NT)",
      epaAct: "Waste Management and Pollution Control Act 1998 (NT)",
    },
  };

  return frameworks[stateCode] || null;
}
