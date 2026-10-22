/**
 * Pure data extraction helpers for inspection report generation.
 *
 * Extracted from app/api/reports/generate-inspection-report/route.ts during
 * RA-511 refactor. These helpers contain no I/O, no Prisma calls, and no
 * session state — they're pure functions suitable for unit testing.
 */

/**
 * Returns true if a value is non-null, non-undefined, non-empty string,
 * and non-empty array. Used throughout the inspection report builder to
 * gate optional field output.
 */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Extract materials affected from a report's tier1 responses, technician
 * analysis, and free-text technician field report. Deduplicates results.
 */
export function extractMaterialsFromReport(report: {
  tier1Responses?: string | null;
  technicianReportAnalysis?: string | null;
  technicianFieldReport?: string | null;
}): string[] {
  const materials: string[] = [];

  // Extract from tier1Responses
  if (report.tier1Responses) {
    try {
      const tier1 = JSON.parse(report.tier1Responses);
      if (
        tier1.T1_Q6_materialsAffected &&
        Array.isArray(tier1.T1_Q6_materialsAffected)
      ) {
        materials.push(...tier1.T1_Q6_materialsAffected);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Extract from technicianReportAnalysis
  if (report.technicianReportAnalysis) {
    try {
      const analysis = JSON.parse(report.technicianReportAnalysis);
      if (
        analysis.materialsAffected &&
        Array.isArray(analysis.materialsAffected)
      ) {
        materials.push(...analysis.materialsAffected);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Extract from technicianFieldReport text
  if (report.technicianFieldReport) {
    const lowerNotes = report.technicianFieldReport.toLowerCase();
    const materialKeywords = [
      "timber",
      "wood",
      "carpet",
      "plasterboard",
      "gyprock",
      "concrete",
      "particleboard",
      "yellow tongue",
      "floating floor",
      "tiles",
      "vinyl",
      "drywall",
      "insulation",
      "ceiling",
      "flooring",
      "subfloor",
    ];

    materialKeywords.forEach((material) => {
      if (lowerNotes.includes(material) && !materials.includes(material)) {
        materials.push(material);
      }
    });
  }

  return [...new Set(materials)]; // Deduplicate
}

/**
 * The Tier 1 water-source options (components/Tier1Questions.tsx), exactly as
 * stored, resolved before any keyword rule. Each option carries its own
 * category label; "Washing machine/dishwasher (Category 1)" would otherwise
 * read as Category 2 by the dishwasher rule below.
 */
const TIER1_WATER_SOURCE_CATEGORIES: Readonly<Record<string, string>> = {
  "Burst pipe (clean water — Category 1)": "Category 1",
  "Overflowing toilet (Category 2 — grey water)": "Category 2",
  "Flood/stormwater (Category 3 — contaminated)": "Category 3",
  "Sewage backup (Category 3 — biohazard)": "Category 3",
  "Roof leak (Category 1 — clean)": "Category 1",
  "Hot water service failure (Category 1)": "Category 1",
  "Washing machine/dishwasher (Category 1)": "Category 1",
  "Unknown source": "Category 1",
  Other: "Category 1",
};

// Keyword rules, all case-insensitive so free text is never under-classified
// because of its capitalisation. They cover the source names, explicit
// category labels, and the terms the per-report classifiers (assessment PDF,
// forensic PDF, scope of works) recognised before they were folded in here.
const CATEGORY_2_PATTERNS = [
  /overflowing toilet/i,
  /\bgr[ae]y[\s-]?water\b/i,
  /\b(?:cat|category)\s*2\b/i,
];
const CATEGORY_3_PATTERNS = [
  /flood/i,
  /sewage/i,
  /biohazard/i,
  /contaminated/i,
  /\bblack[\s-]?water\b/i,
  /\b(?:cat|category)\s*3\b/i,
];

const DISHWASHER = /dishwasher/i;
const DISHWASHER_DISCHARGE = /\b(?:discharg|drain|waste|overflow|outlet)/i;
const DISHWASHER_SUPPLY =
  /\b(?:supply|inlet)\b|\bfeed (?:line|hose|pipe)\b|\bfill (?:line|hose|valve)\b/i;

/**
 * IICRC S500: a dishwasher's supply (inlet) line carries clean, potable water
 * (Category 1); water discharged from the machine (drain, waste, overflow) is
 * grey water (Category 2). Discharge wording wins when both are named, and a
 * dishwasher with neither is treated as discharge.
 */
function isDishwasherDischarge(waterSource: string): boolean {
  if (!DISHWASHER.test(waterSource)) return false;
  if (DISHWASHER_DISCHARGE.test(waterSource)) return true;
  return !DISHWASHER_SUPPLY.test(waterSource);
}

/**
 * Classify a water source description into IICRC S500 water categories:
 * - Category 1 (clean water): burst pipes, roof leaks, appliance failures,
 *   a dishwasher supply line
 * - Category 2 (grey water): overflow toilets, dishwasher discharge
 * - Category 3 (black water): sewage, flood, biohazard
 *
 * An exact Tier 1 option resolves from its table. Otherwise the worst source
 * named governs (IICRC S500), matched without regard to case, and an
 * unrecognised source defaults to Category 1. This is the one classifier
 * report generation uses; do not add private copies.
 */
export function extractWaterCategory(waterSource: string): string {
  if (!waterSource) return "Not specified";

  const option = TIER1_WATER_SOURCE_CATEGORIES[waterSource.trim()];
  if (option) return option;

  // IICRC S500: the worst source present governs, so check the most
  // contaminated category first.
  if (CATEGORY_3_PATTERNS.some((p) => p.test(waterSource)))
    return "Category 3";
  if (
    CATEGORY_2_PATTERNS.some((p) => p.test(waterSource)) ||
    isDishwasherDischarge(waterSource)
  )
    return "Category 2";

  // Burst pipe, roof leak, hot water service, washing machine, a dishwasher
  // supply line, and anything unrecognised.
  return "Category 1";
}

/**
 * Calculate the average moisture percentage from a readings source.
 * Handles: JSON-stringified arrays, plain arrays of objects/numbers, and
 * raw strings containing "X%" tokens. Returns null if no valid values found.
 */
export function extractAverageMoisture(
  moistureReadings: unknown,
): number | null {
  if (!moistureReadings) return null;

  if (typeof moistureReadings === "string") {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(moistureReadings);
      if (Array.isArray(parsed)) {
        const values = parsed
          .map((r: unknown) => {
            const val =
              typeof r === "object" && r !== null
                ? ((
                    r as {
                      moisture?: number;
                      value?: number;
                      percentage?: number;
                    }
                  ).moisture ??
                  (r as { value?: number }).value ??
                  (r as { percentage?: number }).percentage)
                : parseFloat(String(r));
            return val === undefined || isNaN(val as number)
              ? null
              : (val as number);
          })
          .filter((v): v is number => v !== null);
        if (values.length > 0) {
          return values.reduce((a, b) => a + b, 0) / values.length;
        }
      }
    } catch {
      // Not JSON, try to extract numbers from string
      const matches = moistureReadings.match(/(\d+(?:\.\d+)?)\s*%/g);
      if (matches && matches.length > 0) {
        const values = matches.map((m) => parseFloat(m));
        return values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
  } else if (Array.isArray(moistureReadings)) {
    const values = moistureReadings
      .map((r: unknown) => {
        const val =
          typeof r === "object" && r !== null
            ? ((r as { moisture?: number; value?: number; percentage?: number })
                .moisture ??
              (r as { value?: number }).value ??
              (r as { percentage?: number }).percentage)
            : parseFloat(String(r));
        return val === undefined || isNaN(val as number)
          ? null
          : (val as number);
      })
      .filter((v): v is number => v !== null);
    if (values.length > 0) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  return null;
}
