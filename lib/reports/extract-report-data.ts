// Pure helper functions extracted from generate-inspection-report route
// These have no side effects and no external dependencies

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Check if a value exists and is not empty
 */
export function hasValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Extract materials mentioned in a report from various data sources
 */
export function extractMaterialsFromReport(report: any): string[] {
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
    } catch (error) {
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
    } catch (error) {
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
 * Determine water category from a water source description string
 */
export function extractWaterCategory(waterSource: string): string {
  if (!waterSource) return "Not specified";

  const category1Sources = [
    "Burst pipe",
    "Roof leak",
    "Hot water service failure",
    "Washing machine",
    "Dishwasher",
  ];
  const category2Sources = ["Overflowing toilet", "Grey water"];
  const category3Sources = [
    "Flood",
    "Sewage backup",
    "Biohazard",
    "Contaminated",
  ];

  if (category1Sources.some((s) => waterSource.includes(s)))
    return "Category 1";
  if (category2Sources.some((s) => waterSource.includes(s)))
    return "Category 2";
  if (category3Sources.some((s) => waterSource.includes(s)))
    return "Category 3";

  return "Category 1"; // Default
}

/**
 * Calculate average moisture from various formats of moisture readings
 */
export function extractAverageMoisture(moistureReadings: any): number | null {
  if (!moistureReadings) return null;

  if (typeof moistureReadings === "string") {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(moistureReadings);
      if (Array.isArray(parsed)) {
        const values = parsed
          .map((r: any) => {
            const val =
              typeof r === "object"
                ? r.moisture || r.value || r.percentage
                : parseFloat(String(r));
            return isNaN(val) ? null : val;
          })
          .filter((v: any) => v !== null);
        if (values.length > 0) {
          return (
            values.reduce((a: number, b: number) => a + b, 0) / values.length
          );
        }
      }
    } catch (e) {
      // Not JSON, try to extract numbers from string
      const matches = moistureReadings.match(/(\d+(?:\.\d+)?)\s*%/g);
      if (matches && matches.length > 0) {
        const values = matches.map((m: string) => parseFloat(m));
        return values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
  } else if (Array.isArray(moistureReadings)) {
    const values = moistureReadings
      .map((r: any) => {
        const val =
          typeof r === "object"
            ? r.moisture || r.value || r.percentage
            : parseFloat(String(r));
        return isNaN(val) ? null : val;
      })
      .filter((v: any) => v !== null);
    if (values.length > 0) {
      return values.reduce((a: number, b: number) => a + b, 0) / values.length;
    }
  }

  return null;
}
