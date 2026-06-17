/**
 * Wet-vs-dry assessment for an inspection moisture reading (North Star —
 * encodes the veteran instinct "22% on plasterboard is still wet, 1% is dry"
 * that a first-week technician lacks).
 *
 * Reuses the authoritative drying logic (lib/anz/dry-standard.evaluateDrying)
 * and the ANZ materials library (dryStandardMc per material). The only new bit
 * is a thin, conservative surface-type → material resolution: free-text
 * surfaceType strings ("drywall", "wood", …) are normalised to ANZ vocabulary;
 * anything unrecognised — or any non-moisture-content unit (RH, temperature) —
 * returns "unknown" rather than guessing.
 */

import { evaluateDrying } from "@/lib/anz/dry-standard";
import { findMaterialByName } from "@/lib/anz/materials";

// Units that express moisture content and are comparable to a dry standard.
// RH / CELSIUS are environmental, not material MC — never assessed here.
const MC_UNITS = new Set(["PERCENT_MC", "WME", "PERCENT", "%MC", "MC"]);

// Free-text surfaceType synonyms → an ANZ material name/alias resolvable by
// findMaterialByName. Anything not here is passed through as-is (carpet,
// concrete, tiles, lino already resolve directly).
const SURFACE_SYNONYMS: Record<string, string> = {
  drywall: "plasterboard",
  gib: "plasterboard", // NZ term for plasterboard
  gibboard: "plasterboard",
  plaster: "plasterboard",
  gyprock: "plasterboard",
  wood: "timber framing",
  timber: "timber framing",
  studs: "timber framing",
  subfloor: "particleboard flooring",
  vinyl: "vinyl tile",
};

export type ReadingDryness =
  | { status: "unknown"; reason: string }
  | {
      status: "dry" | "not_dry";
      material: string;
      targetMc: number;
      currentMc: number;
      marginMc: number;
    };

export interface ReadingInput {
  surfaceType: string | null | undefined;
  moistureLevel: number;
  unit?: string | null;
}

function isMoistureContentUnit(unit: string | null | undefined): boolean {
  // No unit recorded → assume a moisture-content reading (the common case).
  if (!unit) return true;
  return MC_UNITS.has(unit.trim().toUpperCase());
}

function resolveSurfaceMaterial(surfaceType: string) {
  const norm = surfaceType.trim().toLowerCase();
  const mapped = SURFACE_SYNONYMS[norm] ?? norm;
  return findMaterialByName(mapped);
}

/**
 * Assess a single reading. Conservative: returns "unknown" (never a wet/dry
 * claim) when the unit isn't moisture content or the surface can't be resolved
 * to a known dry standard.
 */
export function assessReadingDryness(reading: ReadingInput): ReadingDryness {
  if (!isMoistureContentUnit(reading.unit)) {
    return {
      status: "unknown",
      reason: `unit "${reading.unit}" is not a moisture-content reading`,
    };
  }
  if (!reading.surfaceType || !reading.surfaceType.trim()) {
    return { status: "unknown", reason: "no surface type recorded" };
  }

  const material = resolveSurfaceMaterial(reading.surfaceType);
  if (!material) {
    return {
      status: "unknown",
      reason: `unrecognised surface "${reading.surfaceType}" — no known dry standard`,
    };
  }

  const evaluation = evaluateDrying({
    currentMc: reading.moistureLevel,
    targetMc: material.dryStandardMc,
  });

  return {
    status: evaluation.status,
    material: material.name,
    targetMc: evaluation.targetMc,
    currentMc: evaluation.currentMc,
    marginMc: evaluation.marginMc,
  };
}

/**
 * Filter a set of readings down to those still above their dry standard, with a
 * short human summary — what the Live Teacher can surface as "still wet".
 */
export function summariseWetReadings(
  readings: Array<ReadingInput & { location?: string | null }>,
): Array<{ location: string | null; material: string; summary: string }> {
  const wet: Array<{
    location: string | null;
    material: string;
    summary: string;
  }> = [];
  for (const reading of readings) {
    const assessed = assessReadingDryness(reading);
    if (assessed.status === "not_dry") {
      wet.push({
        location: reading.location ?? null,
        material: assessed.material,
        summary: `${assessed.material} at ${assessed.currentMc}% is above the ${assessed.targetMc}% dry standard (+${assessed.marginMc.toFixed(1)})`,
      });
    }
  }
  return wet;
}
