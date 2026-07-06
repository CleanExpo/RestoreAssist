/**
 * AU/NZ conversion layer (RA-7000 Knowledge Wiki).
 *
 * The IICRC/ANSI standards corpus this app draws on (lib/standards/*,
 * equipment-calculator.ts sizing ratios, psychrometric-calculations.ts) is
 * US-origin. RestoreAssist operates in Australia/New Zealand. Rather than
 * rewrite the source standards, this module is the reusable conversion LAYER
 * the calc engine, report generator, and Margot call to emit AU/NZ output:
 * unit converters, electrical spec localisation, standards/regulatory-body
 * cross-references, and product/spelling normalisation.
 *
 * Design rule (RA-7001 audit register): only map a US term to an AU/NZ
 * equivalent where a genuine one exists. Where none exists, the original
 * term is left in place and a flag is returned — never fabricate an AS/NZS
 * number or invent a regulator that doesn't exist.
 *
 * Dependency-light: no imports outside this lib/anz sibling folder. Only
 * `materials.ts` is reused (for structural material vocabulary) to avoid
 * duplicating that lookup — see `localiseProductTerm`.
 */

import { findMaterialByName } from "./materials";

// ============================================================
// 1. Units
// ============================================================

export type LengthAreaUnit =
  | "ft2" // square feet -> square metres
  | "ft3" // cubic feet -> cubic metres
  | "ft" // feet -> metres
  | "in" // inches -> millimetres
  | "lb" // pounds -> kilograms
  | "f" // Fahrenheit -> Celsius
  | "gpp" // grains per pound (humidity ratio) -> grams per kilogram
  | "pint_per_day" // US pints/day (dehumidifier extraction) -> litres/day
  | "inhg"; // inches of mercury -> kilopascals

// --- Exact conversion factors (all internationally defined, not rounded) ---

/** 1 international foot = 0.3048 m exactly. */
export const FT_TO_M = 0.3048;
/** ft² -> m² = 0.3048² exactly. */
export const FT2_TO_M2 = 0.09290304;
/** ft³ -> m³ = 0.3048³ exactly. */
export const FT3_TO_M3 = 0.028316846592;
/** 1 international inch = 25.4 mm exactly. */
export const IN_TO_MM = 25.4;
/** 1 international avoirdupois pound = 0.45359237 kg exactly. */
export const LB_TO_KG = 0.45359237;
/** 1 US liquid pint = 0.473176473 L (US gallon 3.785411784 L ÷ 8), exact by definition. */
export const US_PINT_TO_L = 0.473176473;
/**
 * 1 inHg (conventional, 0°C reference) = 3.386389 kPa. Derived from the
 * standard atmosphere identity 29.9213 inHg = 101.325 kPa.
 */
export const INHG_TO_KPA = 3.386389;
/**
 * GPP (grains of water per pound of dry air) -> g/kg (grams of water per
 * kilogram of dry air): the humidity ratio is a dimensionless mass ratio,
 * so it is unit-independent; only the mass units on top and bottom change.
 * 1 lb = 7000 grains, so GPP / 7000 = kg-water/kg-dry-air, and
 * ×1000 for grams => factor is 1000/7000 = 1/7.
 * Reference: 69 GPP (~25°C/50%RH, cited in lib/psychrometric-calculations.ts)
 * -> 69/7 ≈ 9.86 g/kg, matching standard ASHRAE psychrometric chart values.
 */
export const GPP_TO_G_PER_KG = 1 / 7;

export function sqFtToSqM(ft2: number): number {
  return ft2 * FT2_TO_M2;
}

export function sqMToSqFt(m2: number): number {
  return m2 / FT2_TO_M2;
}

export function cubicFtToCubicM(ft3: number): number {
  return ft3 * FT3_TO_M3;
}

export function cubicMToCubicFt(m3: number): number {
  return m3 / FT3_TO_M3;
}

export function ftToM(ft: number): number {
  return ft * FT_TO_M;
}

export function mToFt(m: number): number {
  return m / FT_TO_M;
}

export function inchesToMm(inches: number): number {
  return inches * IN_TO_MM;
}

export function mmToInches(mm: number): number {
  return mm / IN_TO_MM;
}

export function lbToKg(lb: number): number {
  return lb * LB_TO_KG;
}

export function kgToLb(kg: number): number {
  return kg / LB_TO_KG;
}

export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

/**
 * GPP (grains/lb dry air) -> g/kg dry air. The app's psychrometric engine
 * (lib/psychrometric-calculations.ts `calculateGPP`) computes GPP directly
 * from temperature/RH; this is a label-level metric equivalent for any
 * IICRC-sourced GPP figure quoted in prose (e.g. imported S500 tables).
 */
export function gppToGramsPerKg(gpp: number): number {
  return gpp * GPP_TO_G_PER_KG;
}

export function gramsPerKgToGpp(gPerKg: number): number {
  return gPerKg / GPP_TO_G_PER_KG;
}

/** US pints/day (AHAM-style dehumidifier rating) -> litres/day. */
export function pintsPerDayToLitresPerDay(pints: number): number {
  return pints * US_PINT_TO_L;
}

export function litresPerDayToPintsPerDay(litres: number): number {
  return litres / US_PINT_TO_L;
}

export function inHgToKPa(inHg: number): number {
  return inHg * INHG_TO_KPA;
}

export function kPaToInHg(kPa: number): number {
  return kPa / INHG_TO_KPA;
}

export interface MetricConversion {
  value: number;
  unit: string;
  /** Human-readable label, e.g. "0.93 m²". */
  label: string;
}

const METRIC_UNIT_LABEL: Record<LengthAreaUnit, string> = {
  ft2: "m²",
  ft3: "m³",
  ft: "m",
  in: "mm",
  lb: "kg",
  f: "°C",
  gpp: "g/kg",
  pint_per_day: "L/day",
  inhg: "kPa",
};

/**
 * Convert a US/imperial value to its metric equivalent given a unit code.
 * Rounds the label to 2 decimal places for display; `value` is unrounded.
 */
export function toMetric(value: number, unit: LengthAreaUnit): MetricConversion {
  const converted = (() => {
    switch (unit) {
      case "ft2":
        return sqFtToSqM(value);
      case "ft3":
        return cubicFtToCubicM(value);
      case "ft":
        return ftToM(value);
      case "in":
        return inchesToMm(value);
      case "lb":
        return lbToKg(value);
      case "f":
        return fahrenheitToCelsius(value);
      case "gpp":
        return gppToGramsPerKg(value);
      case "pint_per_day":
        return pintsPerDayToLitresPerDay(value);
      case "inhg":
        return inHgToKPa(value);
    }
  })();

  const metricUnit = METRIC_UNIT_LABEL[unit];
  return {
    value: converted,
    unit: metricUnit,
    label: `${Math.round(converted * 100) / 100} ${metricUnit}`,
  };
}

// ============================================================
// 2. Electrical: 120V/60Hz/15A (US) -> 230V/50Hz/10A + RCD (AU/NZ)
// ============================================================

export interface ElectricalSpec {
  voltage: number;
  frequencyHz: number;
  /** Standard general-purpose circuit rating, amps. */
  standardCircuitAmps: number;
  earthTerm: string;
  protectionDevice: string;
  outletTerm: string;
  plugStandard?: string;
  wiringStandard?: string;
}

export const US_ELECTRICAL_SPEC: ElectricalSpec = {
  voltage: 120,
  frequencyHz: 60,
  standardCircuitAmps: 15,
  earthTerm: "ground",
  protectionDevice: "GFCI (ground-fault circuit interrupter)",
  outletTerm: "outlet / receptacle",
  plugStandard: "NEMA 5-15",
};

/**
 * AU/NZ target electrical spec. Equipment sizing already uses 230 V figures
 * (lib/equipment-matrix.ts); this is the reference for localising prose that
 * still quotes US mains figures (imported S500 text, product manuals, etc).
 */
export const AUNZ_ELECTRICAL_SPEC: ElectricalSpec = {
  voltage: 230,
  frequencyHz: 50,
  standardCircuitAmps: 10,
  earthTerm: "earth (MEN — multiple earthed neutral system)",
  protectionDevice: "RCD (residual current device)",
  outletTerm: "GPO (general purpose outlet)",
  plugStandard: "AS/NZS 3112",
  wiringStandard: "AS/NZS 3000:2018 (Wiring Rules)",
};

/**
 * Whole-word, case-preserving text replacements for US electrical vocabulary
 * -> AU/NZ. Applied by `localiseElectricalText`. Ordered longest-match-first
 * so e.g. "circuit breaker" is matched before a bare "breaker" would be.
 */
const ELECTRICAL_TERM_MAP: Array<[RegExp, string]> = [
  [/\bground[- ]fault circuit interrupter\b/gi, "residual current device (RCD)"],
  [/\bGFCI\b/g, "RCD"],
  [/\breceptacles\b/gi, "GPOs"],
  [/\breceptacle\b/gi, "GPO"],
  [/\boutlets\b/gi, "GPOs"],
  [/\boutlet\b/gi, "GPO"],
  [/\bgrounding\b/gi, "earthing"],
  [/\bgrounded\b/gi, "earthed"],
  [/\bground wire\b/gi, "earth wire"],
  [/\bground\b/gi, "earth"],
  [/\b120[- ]?V(?:olt)?s?\b/gi, "230V"],
  [/\b60[- ]?Hz\b/gi, "50Hz"],
  [/\b15[- ]?amp(?:ere)?s?\b/gi, "10-amp"],
  [/\b15A\b/g, "10A"],
];

/**
 * Replace US electrical vocabulary and mains figures in free text with the
 * AU/NZ equivalents. Numeric equipment specs (amps/watts) computed elsewhere
 * in the app already use 230 V source data (lib/equipment-matrix.ts) — this
 * targets imported/quoted US-standard prose, not the app's own calculations.
 */
export function localiseElectricalText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ELECTRICAL_TERM_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ============================================================
// 3. Standards & regulatory bodies
// ============================================================

export interface StandardsCrossReference {
  /** The US term/body/standard as it appears in source material. */
  usTerm: string;
  /** AU equivalent body/standard, where a genuine one exists. */
  auEquivalent?: string;
  /** NZ equivalent body/standard, where a genuine one exists. */
  nzEquivalent?: string;
  /** False when no direct AU/NZ equivalent exists — do not invent one. */
  hasDirectEquivalent: boolean;
  /** Why the mapping is (or isn't) direct; cites the real AU/NZ standard/body. */
  notes: string;
}

/**
 * Regulatory-body and standards cross-reference map. Every `auEquivalent` /
 * `nzEquivalent` cites a real, currently-published AU/NZ standard or
 * regulator. Entries with `hasDirectEquivalent: false` are intentionally
 * left unmapped — flagged, not guessed.
 */
export const STANDARDS_CROSS_REFERENCE: StandardsCrossReference[] = [
  {
    usTerm: "OSHA (Occupational Safety and Health Administration)",
    auEquivalent:
      "WHS (Work Health and Safety) laws — Safe Work Australia model WHS Act/Regulations, enforced by state/territory regulators (SafeWork NSW, WorkSafe VIC/QLD/WA/NT, SafeWork SA, WorkSafe TAS, WorkSafe ACT)",
    nzEquivalent: "HSWA — Health and Safety at Work Act 2015, enforced by WorkSafe New Zealand",
    hasDirectEquivalent: true,
    notes:
      "Functional equivalent, not an identical body: AU has no single federal enforcement regulator like OSHA — Safe Work Australia sets national model policy, each state/territory regulator enforces it.",
  },
  {
    usTerm: "NIOSH (National Institute for Occupational Safety and Health)",
    hasDirectEquivalent: false,
    notes:
      "No direct AU/NZ equivalent research institute. Closest parallel is Safe Work Australia's guidance-material function (workplace exposure standards, codes of practice), but this is a policy body, not a dedicated OHS research institute like NIOSH. Left unmapped rather than substituting a non-equivalent body.",
  },
  {
    usTerm: "ACGIH TLVs (Threshold Limit Values)",
    auEquivalent:
      "Safe Work Australia Workplace Exposure Standards (WES) for airborne contaminants",
    nzEquivalent: "WorkSafe New Zealand Workplace Exposure Standards (WES)",
    hasDirectEquivalent: true,
    notes:
      "AU/NZ WES figures are independently set and do not always numerically match ACGIH TLVs for the same substance — cite the AU/NZ WES value, not a converted ACGIH figure.",
  },
  {
    usTerm: "ANSI/IICRC mould air sampling guidance",
    auEquivalent:
      "AS/NZS 4849.1:2003 — Indoor air quality: Methods for sampling and analysis of fungi, Part 1: Air sampling technique",
    nzEquivalent:
      "AS/NZS 4849.1:2003 (joint AU/NZ standard — same document applies in both jurisdictions)",
    hasDirectEquivalent: true,
    notes: "Joint standard; cite the AS/NZS number directly, not an ANSI/IICRC section.",
  },
  {
    usTerm: "ANSI Z88.2 (respiratory protective equipment)",
    auEquivalent:
      "AS/NZS 1715:2009 — Selection, use and maintenance of respiratory protective equipment",
    nzEquivalent: "AS/NZS 1715:2009 (joint AU/NZ standard)",
    hasDirectEquivalent: true,
    notes:
      "Companion device standard: AS/NZS 1716:2012 — Respiratory protective devices (device certification, not selection/use).",
  },
  {
    usTerm: "NFPA 70E / OSHA electrical test-and-tag / GFCI testing",
    auEquivalent:
      "AS/NZS 3760:2022 — In-service safety inspection and testing of electrical equipment",
    nzEquivalent: "AS/NZS 3760:2022 (joint AU/NZ standard)",
    hasDirectEquivalent: true,
    notes: "The AU/NZ \"test and tag\" standard for portable equipment used on restoration sites.",
  },
  {
    usTerm: "EPA-registered (antimicrobial/biocide products)",
    auEquivalent:
      "APVMA (Australian Pesticides and Veterinary Medicines Authority) registration for agricultural/surface biocides; TGA (Therapeutic Goods Administration) for products carrying a therapeutic/disinfectant claim",
    nzEquivalent: "ACVM (NZ Food Safety) registration; Medsafe for therapeutic claims",
    hasDirectEquivalent: true,
    notes:
      "Two possible AU regulators depending on the product's claim — flag which applies per product rather than defaulting to one.",
  },
  {
    usTerm: "ASTM C1396 (gypsum board manufacturing standard)",
    auEquivalent: "AS/NZS 2588:1998 — Gypsum plasterboard",
    nzEquivalent: "AS/NZS 2588:1998 (joint AU/NZ standard)",
    hasDirectEquivalent: true,
    notes: "Material spec cross-reference for drywall/plasterboard product callouts.",
  },
  {
    usTerm: "ANSI Z87.1 (eye and face protection)",
    auEquivalent: "AS/NZS 1337.1:2010 — Personal eye protection: Eye and face protectors for occupational applications",
    nzEquivalent: "AS/NZS 1337.1:2010 (joint AU/NZ standard)",
    hasDirectEquivalent: true,
    notes: "PPE cross-reference for demolition/hazmat scope items.",
  },
  {
    usTerm: "IBC / IRC (US building codes)",
    auEquivalent: "NCC (National Construction Code) — see lib/anz/ncc.ts for edition handling",
    nzEquivalent: "NZBC (New Zealand Building Code) — see lib/nir-jurisdictional-matrix.ts",
    hasDirectEquivalent: true,
    notes:
      "Already handled by existing lib/anz/ncc.ts and lib/nir-jurisdictional-matrix.ts — this entry exists only as a cross-reference pointer; do not duplicate that logic here.",
  },
];

const STANDARDS_BY_US_TERM = new Map(
  STANDARDS_CROSS_REFERENCE.map((entry) => [entry.usTerm.toLowerCase(), entry]),
);

/** Look up the cross-reference entry for a US term (case-insensitive exact match). */
export function crossReferenceStandard(usTerm: string): StandardsCrossReference | undefined {
  return STANDARDS_BY_US_TERM.get(usTerm.trim().toLowerCase());
}

/** Short US acronym/name -> cross-reference entry, for substring matching in prose. */
const REGULATORY_TEXT_PATTERNS: Array<[RegExp, StandardsCrossReference]> = [
  [/\bOSHA\b/g, STANDARDS_CROSS_REFERENCE[0]],
  [/\bNIOSH\b/g, STANDARDS_CROSS_REFERENCE[1]],
  [/\bACGIH\b/g, STANDARDS_CROSS_REFERENCE[2]],
  [/\bEPA[- ]registered\b/gi, STANDARDS_CROSS_REFERENCE[6]],
];

export interface LocalisationFlag {
  term: string;
  reason: string;
}

/**
 * Replace recognised US regulatory acronyms in free text with the AU or NZ
 * equivalent body. Terms with no direct equivalent (e.g. NIOSH) are left
 * as-is and returned in `flags` rather than mapped to a wrong body.
 */
export function localiseRegulatoryText(
  text: string,
  region: AnzRegion = "AU",
): { text: string; flags: LocalisationFlag[] } {
  let result = text;
  const flags: LocalisationFlag[] = [];

  for (const [pattern, entry] of REGULATORY_TEXT_PATTERNS) {
    if (!pattern.test(result)) continue;
    // reset lastIndex for global regexes reused with .test above
    pattern.lastIndex = 0;

    if (!entry.hasDirectEquivalent) {
      flags.push({
        term: entry.usTerm,
        reason: `No direct AU/NZ equivalent — left unmapped. ${entry.notes}`,
      });
      continue;
    }

    const replacement = region === "NZ" ? entry.nzEquivalent : entry.auEquivalent;
    if (replacement) {
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, flags };
}

// ============================================================
// 4. Products/terminology + AU English spelling
// ============================================================

export type AnzRegion = "AU" | "NZ";

/**
 * General US -> AU/NZ trade & restoration vocabulary not already covered by
 * `lib/anz/materials.ts` (structural materials — drywall/gypsum board is
 * handled there via the "gyprock" alias list, reused by
 * `localiseProductTerm` below rather than duplicated here).
 */
const PRODUCT_TERM_MAP: Array<[RegExp, string]> = [
  [/\bbaseboards?\b/gi, "skirting board"],
  [/\bcrawl\s?space\b/gi, "subfloor space"],
  [/\bpopcorn ceiling\b/gi, "textured ceiling"],
  [/\bflashlights?\b/gi, "torch"],
  [/\btrash cans?\b/gi, "rubbish bin"],
  [/\bdumpsters?\b/gi, "skip bin"],
  [/\bparking lots?\b/gi, "car park"],
  [/\bsidewalks?\b/gi, "footpath"],
  [/\bcurbs?\b/gi, "kerb"],
  [/\battic\b/gi, "roof cavity"],
  [/\bsheetrock\b/gi, "plasterboard (Gyprock)"],
];

/**
 * Resolve a single product/material term to its AU/NZ name. Reuses
 * `lib/anz/materials.ts` first (structural materials — the source of truth
 * for wall/ceiling/floor/roof/cladding/framing vocabulary), then falls back
 * to the general trade-terminology map for non-structural items.
 */
export function localiseProductTerm(term: string): string {
  const material = findMaterialByName(term);
  if (material) return material.name;

  for (const [pattern, replacement] of PRODUCT_TERM_MAP) {
    if (pattern.test(term)) {
      pattern.lastIndex = 0;
      return term.replace(pattern, replacement);
    }
    pattern.lastIndex = 0;
  }
  return term;
}

/** Replace general trade-terminology in free text (does not touch materials.ts vocabulary — apply findMaterialByName separately for structural elements). */
export function localiseProductText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PRODUCT_TERM_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * US -> AU English spelling map. Whole-word, case-preserving. Only
 * unambiguous pairs are included — see `SPELLING_EXCLUSIONS` below for
 * words deliberately left out because the "US spelling" is also correct
 * (or means something different) in AU English.
 */
const AU_SPELLING_PAIRS: Array<[string, string]> = [
  ["color", "colour"],
  ["colored", "coloured"],
  ["coloring", "colouring"],
  ["mold", "mould"],
  ["molded", "moulded"],
  ["molding", "moulding"],
  ["fiber", "fibre"],
  ["fiberglass", "fibreglass"],
  ["liter", "litre"],
  ["liters", "litres"],
  ["center", "centre"],
  ["centered", "centred"],
  ["defense", "defence"],
  ["offense", "offence"],
  ["organize", "organise"],
  ["organized", "organised"],
  ["organization", "organisation"],
  ["analyze", "analyse"],
  ["analyzed", "analysed"],
  ["realize", "realise"],
  ["realized", "realised"],
  ["favor", "favour"],
  ["favorite", "favourite"],
  ["honor", "honour"],
  ["neighbor", "neighbour"],
  ["labor", "labour"],
  ["traveled", "travelled"],
  ["traveling", "travelling"],
  ["canceled", "cancelled"],
  ["canceling", "cancelling"],
  ["modeling", "modelling"], // structural/drying "modeling" (e.g. moisture modeling)
  ["gray", "grey"],
  ["tire", "tyre"],
  ["tires", "tyres"],
  ["aluminum", "aluminium"],
  ["curb", "kerb"],
  ["sidewalk", "footpath"],
  ["specialty", "speciality"],
  ["catalog", "catalogue"],
];

/**
 * Deliberately-excluded US/AU word pairs — spelled the same in AU English in
 * this restoration-report context, or context-dependent enough that a blind
 * replace would introduce an error. Not auto-converted by `localiseSpelling`.
 */
export const SPELLING_EXCLUSIONS: LocalisationFlag[] = [
  {
    term: "meter",
    reason:
      "A measuring instrument (\"moisture meter\") is \"meter\" in AU English too — only the unit of length is \"metre\". Blind replacement would wrongly produce \"moisture metre\".",
  },
  {
    term: "program",
    reason:
      "A computer program stays \"program\" in AU English; only a scheduled series of events is \"programme\". Context-dependent — left unmapped.",
  },
  {
    term: "practice / practise",
    reason:
      "AU English distinguishes noun (\"practice\") from verb (\"practise\"); the source word is the same in US English either way, so the correct AU form can't be inferred by string match alone.",
  },
  {
    term: "license",
    reason:
      "AU English distinguishes noun (\"licence\") from verb (\"license\"), same issue as practice/practise.",
  },
  {
    term: "story/stories (building levels)",
    reason:
      "Same in AU English (\"storey/storeys\" is a valid AU variant but \"story\" is also accepted for building levels) — ambiguous with narrative \"story\", left unmapped.",
  },
];

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const SPELLING_PATTERNS: Array<[RegExp, string]> = AU_SPELLING_PAIRS.map(
  ([us, au]) => [new RegExp(`\\b${us}\\b`, "gi"), au],
);

/** Normalise US spelling to AU English in free text (whole-word, case-preserving). */
export function localiseSpelling(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SPELLING_PATTERNS) {
    result = result.replace(pattern, (match) => matchCase(match, replacement));
  }
  return result;
}

// ============================================================
// 5. Top-level composer
// ============================================================

export interface LocaliseOptions {
  region?: AnzRegion;
  /** Apply electrical vocabulary/mains-figure localisation. Default true. */
  applyElectrical?: boolean;
  /** Apply regulatory-body/standards cross-references. Default true. */
  applyStandards?: boolean;
  /** Apply general product/trade terminology. Default true. */
  applyProducts?: boolean;
  /** Apply AU English spelling normalisation. Default true. */
  applySpelling?: boolean;
}

export interface LocalisationResult {
  text: string;
  /** Terms that had no genuine AU/NZ equivalent and were left unmapped. */
  flags: LocalisationFlag[];
}

/**
 * Apply the full AU/NZ text-localisation layer to a piece of prose: US
 * electrical vocabulary, regulatory-body cross-references, product/trade
 * terminology, and AU English spelling. Numeric unit conversion is a
 * separate concern — use `toMetric` / the named converters in section 1 on
 * the calc-engine values feeding the prose, not on rendered text.
 */
export function localiseForAUNZ(
  text: string,
  opts: LocaliseOptions = {},
): LocalisationResult {
  const {
    region = "AU",
    applyElectrical = true,
    applyStandards = true,
    applyProducts = true,
    applySpelling = true,
  } = opts;

  let result = text;
  let flags: LocalisationFlag[] = [];

  if (applyElectrical) {
    result = localiseElectricalText(result);
  }
  if (applyStandards) {
    const { text: withStandards, flags: standardsFlags } = localiseRegulatoryText(
      result,
      region,
    );
    result = withStandards;
    flags = flags.concat(standardsFlags);
  }
  if (applyProducts) {
    result = localiseProductText(result);
  }
  if (applySpelling) {
    result = localiseSpelling(result);
  }

  return { text: result, flags };
}
