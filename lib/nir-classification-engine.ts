/**
 * NIR Classification Engine
 * Implements IICRC standards for water damage classification.
 *
 * v2.0: All clause references are sourced from nir-standards-mapping.ts.
 * No hardcoded IICRC section strings — every reference is typed, auditable,
 * and tied to a specific edition clause.
 *
 * Categories (Water Source) — IICRC S500 §7.1–7.3:
 *   Category 1: Clean / potable water
 *   Category 2: Grey water (contaminants, no faecal matter)
 *   Category 3: Black / contaminated water (sewage, external flooding)
 *
 * Classes (Evaporation Load) — IICRC S500 §8.1–8.4:
 *   Class 1: <10% of floor space, low porosity materials
 *   Class 2: 10–40% of floor space, carpet and cushion
 *   Class 3: >40% of floor space, walls, ceilings, insulation
 *   Class 4: Specialty drying — concrete, hardwood, dense materials
 */

import {
  S500_FIELD_MAP,
  STANDARDS_VERSIONS,
} from "@/lib/nir-standards-mapping";
import { sqmToSqft } from "@/lib/units";
import { readingMatchesArea } from "@/lib/moisture/reading-room-join";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type MoistureLevel = "NORMAL" | "ELEVATED" | "CRITICAL";

export interface MoistureAssessment {
  surfaceType: string;
  moistureLevel: number;
  assessment: MoistureLevel;
  clauseRef: string;
  /** Material-specific thresholds used for this assessment (null = fallback applied) */
  thresholds: { normal: number; elevated: number; critical: number } | null;
}

export interface ClassificationInput {
  waterSource: string;
  /** Field kept as square footage for API/schema backward compatibility */
  affectedSquareFootage: number;
  moistureReadings: Array<{
    surfaceType: string;
    moistureLevel: number;
    depth: string;
  }>;
  environmentalData: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint?: number | null;
  } | null;
  timeSinceLoss?: number | null;
}

export interface ClassificationResult {
  category: string;
  class: string;
  justification: string;
  /** Kept for backward compatibility — equals clauseRefs.join('; ') */
  standardReference: string;
  /** Typed clause references sourced from nir-standards-mapping.ts */
  clauseRefs: string[];
  confidence: number;
  /** Per-reading moisture assessment against S500 §12.3 material thresholds */
  moistureAssessments: MoistureAssessment[];
  /** True if Cat 1 was upgraded to Cat 2 due to elapsed time (S500 §7.1 note) */
  timeEscalationApplied: boolean;
  /** IICRC S500 edition cited — sourced from STANDARDS_VERSIONS.S500.edition */
  iicrcEdition: string;
}

// ─── MOISTURE ASSESSMENT ─────────────────────────────────────────────────────

const SPECIALTY_MATERIALS = [
  "concrete",
  "hardwood",
  "timber",
  "dense",
  "brick",
  "stone",
  "plaster",
];

function assessMoistureReading(reading: {
  surfaceType: string;
  moistureLevel: number;
  depth: string;
}): MoistureAssessment {
  const surfaceLower = reading.surfaceType.toLowerCase();
  const { thresholds, clauseRef } = S500_FIELD_MAP.moistureContent;

  // Map surface type to the closest S500 §12.3 material category
  let threshold: { normal: number; elevated: number; critical: number } | null =
    null;

  if (
    surfaceLower.includes("wood") ||
    surfaceLower.includes("hardwood") ||
    surfaceLower.includes("timber")
  ) {
    threshold = thresholds.wood;
  } else if (
    surfaceLower.includes("drywall") ||
    surfaceLower.includes("gyprock") ||
    surfaceLower.includes("plasterboard") ||
    surfaceLower.includes("gypsum")
  ) {
    threshold = thresholds.drywall;
  } else if (
    surfaceLower.includes("concrete") ||
    surfaceLower.includes("brick") ||
    surfaceLower.includes("stone") ||
    surfaceLower.includes("tile") ||
    surfaceLower.includes("masonry")
  ) {
    threshold = thresholds.concrete;
  } else if (surfaceLower.includes("carpet") || surfaceLower.includes("rug")) {
    threshold = thresholds.carpet;
  }

  // Use wood as a conservative fallback when no material match
  const effectiveThreshold = threshold ?? thresholds.wood;

  let assessment: MoistureLevel = "NORMAL";
  if (reading.moistureLevel >= effectiveThreshold.critical) {
    assessment = "CRITICAL";
  } else if (reading.moistureLevel >= effectiveThreshold.elevated) {
    assessment = "ELEVATED";
  }

  return {
    surfaceType: reading.surfaceType,
    moistureLevel: reading.moistureLevel,
    assessment,
    clauseRef,
    thresholds: threshold, // null signals fallback was used
  };
}

// ─── MAIN CLASSIFICATION ──────────────────────────────────────────────────────

export async function classifyIICRC(
  input: ClassificationInput,
): Promise<ClassificationResult> {
  return classifyWaterDamage(input);
}

/** Synchronous core of classifyIICRC — pure, safe to call from the browser. */
export function classifyWaterDamage(
  input: ClassificationInput,
): ClassificationResult {
  const clauseRefs: string[] = [];
  const { waterCategory, waterClass, moistureContent, dryingEquipment } =
    S500_FIELD_MAP;

  // ── Category — IICRC S500 §7.1–7.3 ─────────────────────────────────────────
  let category = "1";
  let categoryJustification = "";
  let timeEscalationApplied = false;

  const waterSourceLower = input.waterSource.toLowerCase();

  if (
    waterSourceLower.includes("black") ||
    waterSourceLower.includes("sewage") ||
    waterSourceLower.includes("contaminated") ||
    waterSourceLower.includes("faecal") ||
    waterSourceLower.includes("fecal")
  ) {
    category = "3";
    const def = waterCategory.definitions.category3;
    categoryJustification =
      `${def.label}: ${def.source}. ` +
      `Containment: REQUIRED. PPE: REQUIRED (${waterCategory.clauseRef}).`;
  } else if (
    waterSourceLower.includes("grey") ||
    waterSourceLower.includes("gray") ||
    waterSourceLower.includes("washing") ||
    waterSourceLower.includes("dishwasher") ||
    (waterSourceLower.includes("toilet") &&
      !waterSourceLower.includes("faecal"))
  ) {
    category = "2";
    const def = waterCategory.definitions.category2;
    categoryJustification = `${def.label}: ${def.source}. Sanitisation required (${waterCategory.clauseRef}).`;
  } else if (
    waterSourceLower.includes("clean") ||
    waterSourceLower.includes("potable") ||
    waterSourceLower.includes("pipe") ||
    waterSourceLower.includes("rain") ||
    waterSourceLower.includes("supply")
  ) {
    category = "1";
    const def = waterCategory.definitions.category1;
    categoryJustification = `${def.label}: ${def.source} (${waterCategory.clauseRef}).`;
  } else {
    // Conservative default — grey water
    category = "2";
    categoryJustification = `Water source unclear. Defaulting to Category 2 (grey water) per ${waterCategory.clauseRef}.`;
  }

  clauseRefs.push(waterCategory.clauseRef);

  // ── Time escalation — S500 §7.1 note ────────────────────────────────────────
  if (category === "1" && input.timeSinceLoss && input.timeSinceLoss > 48) {
    category = "2";
    categoryJustification += ` ${waterCategory.timeEscalation} — ${input.timeSinceLoss} hrs elapsed, category upgraded.`;
    timeEscalationApplied = true;
  }

  // ── Moisture Assessments — S500 §12.3 ───────────────────────────────────────
  const moistureAssessments = input.moistureReadings.map(assessMoistureReading);
  const avgMoisture =
    moistureAssessments.length > 0
      ? moistureAssessments.reduce((sum, a) => sum + a.moistureLevel, 0) /
        moistureAssessments.length
      : 0;

  const hasCriticalReading = moistureAssessments.some(
    (a) => a.assessment === "CRITICAL",
  );
  if (hasCriticalReading) {
    clauseRefs.push(moistureContent.clauseRef);
  }

  // ── Class — S500 §8.1–8.4 ───────────────────────────────────────────────────
  let classValue = "1";
  let classJustification = "";

  const hasSpecialtyMaterial = input.moistureReadings.some((r) =>
    SPECIALTY_MATERIALS.some((m) => r.surfaceType.toLowerCase().includes(m)),
  );
  const { definitions: classDefs } = waterClass;

  if (hasSpecialtyMaterial && avgMoisture > 15) {
    classValue = "4";
    classJustification =
      `${classDefs.class4.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class4.materials} detected. ` +
      `Avg moisture ${avgMoisture.toFixed(1)}%. Extended drying protocol required.`;
  } else if (input.affectedSquareFootage > 500 && avgMoisture > 20) {
    classValue = "3";
    classJustification =
      `${classDefs.class3.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class3.affectedArea} of floor space affected. ` +
      `${classDefs.class3.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`;
  } else if (input.affectedSquareFootage > 100 || avgMoisture > 15) {
    classValue = "2";
    classJustification =
      `${classDefs.class2.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class2.affectedArea} of floor space affected. ` +
      `${classDefs.class2.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`;
  } else {
    classValue = "1";
    classJustification =
      `${classDefs.class1.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class1.affectedArea} of floor space affected. ` +
      `${classDefs.class1.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`;
  }

  clauseRefs.push(waterClass.clauseRef);
  clauseRefs.push(dryingEquipment.clauseRef);

  // ── Confidence ───────────────────────────────────────────────────────────────
  let confidence = 85;

  if (input.moistureReadings.length >= 3) confidence += 5;
  if (
    input.environmentalData?.ambientTemperature &&
    input.environmentalData?.humidityLevel
  ) {
    confidence += 5;
  }
  if (
    !waterSourceLower.includes("clean") &&
    !waterSourceLower.includes("grey") &&
    !waterSourceLower.includes("gray") &&
    !waterSourceLower.includes("black")
  ) {
    confidence -= 10;
  }

  confidence = Math.min(100, Math.max(0, confidence));

  const uniqueClauseRefs = [...new Set(clauseRefs)];

  return {
    category,
    class: classValue,
    justification: `${categoryJustification} ${classJustification}`.trim(),
    standardReference: uniqueClauseRefs.join("; "),
    clauseRefs: uniqueClauseRefs,
    confidence,
    moistureAssessments,
    timeEscalationApplied,
    iicrcEdition: STANDARDS_VERSIONS.S500.edition,
  };
}

// ─── WHOLE-INSPECTION CLASSIFICATION (RA-7709) ────────────────────────────────
//
// The one function both the Review & Submit preview and the submit route call,
// so what the technician is shown is what gets saved. Readings are matched to
// an area by the RA-7610 room join: a reading linked to a drawn room counts in
// that room; free-text location decides only when there is no link.

export interface InspectionClassificationInput {
  affectedAreas: Array<{
    roomZoneId: string;
    /** Area in m². Converted to sq ft for the sq-ft-native engine above. */
    areaSqm: number;
    waterSource: string;
    timeSinceLoss?: number | null;
  }>;
  moistureReadings: Array<{
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: string;
    /** RA-7610: the drawn room this reading was taken in, if linked. */
    sketchRoomId?: string | null;
    /** Needed to match a linked reading to an area by the room's name. */
    sketchRoom?: { id?: string; name: string } | null;
  }>;
  environmentalData: ClassificationInput["environmentalData"];
  /** The technician's own choice. Applied only when both fields are set. */
  manual?: { category?: string | null; class?: string | null } | null;
}

export interface InspectionClassification {
  category: string;
  class: string;
  justification: string;
  standardReference: string;
  confidence: number;
  manualOverride: boolean;
  areas: Array<{
    roomZoneId: string;
    category: string;
    class: string;
    /** Exactly what the engine was given for this area. */
    input: ClassificationInput;
  }>;
}

export const MANUAL_OVERRIDE_JUSTIFICATION =
  "Technician manual classification override recorded during inspection review.";
export const MANUAL_OVERRIDE_REFERENCE = "IICRC S500:2021 §7.1";

/**
 * Classify every affected area, then take the worst category and the worst
 * class across the job. A technician choice (both fields) replaces the result
 * for every area.
 */
export function classifyInspection(
  input: InspectionClassificationInput,
): InspectionClassification {
  const manual =
    input.manual?.category && input.manual?.class
      ? { category: input.manual.category, class: input.manual.class }
      : null;

  const perArea = input.affectedAreas.map((area) => {
    const areaInput: ClassificationInput = {
      waterSource: area.waterSource,
      affectedSquareFootage: sqmToSqft(area.areaSqm),
      moistureReadings: input.moistureReadings
        .filter((r) => readingMatchesArea(r, area))
        .map((r) => ({
          surfaceType: r.surfaceType,
          moistureLevel: r.moistureLevel,
          depth: r.depth,
        })),
      environmentalData: input.environmentalData,
      timeSinceLoss: area.timeSinceLoss,
    };
    return {
      roomZoneId: area.roomZoneId,
      input: areaInput,
      result: classifyWaterDamage(areaInput),
    };
  });

  let category = "1";
  let classValue = "1";
  for (const { result } of perArea) {
    if (parseInt(result.category) > parseInt(category)) {
      category = result.category;
    }
    if (parseInt(result.class) > parseInt(classValue)) {
      classValue = result.class;
    }
  }

  if (manual) {
    return {
      category: manual.category,
      class: manual.class,
      justification: MANUAL_OVERRIDE_JUSTIFICATION,
      standardReference: MANUAL_OVERRIDE_REFERENCE,
      confidence: 100,
      manualOverride: true,
      areas: perArea.map(({ roomZoneId, input: areaInput }) => ({
        roomZoneId,
        category: manual.category,
        class: manual.class,
        input: areaInput,
      })),
    };
  }

  const single = perArea.length === 1 ? perArea[0].result : null;
  return {
    category,
    class: classValue,
    justification: single
      ? single.justification
      : perArea
          .map(
            ({ roomZoneId, result }) => `${roomZoneId}: ${result.justification}`,
          )
          .join(" | "),
    standardReference: single
      ? single.standardReference
      : [...new Set(perArea.flatMap(({ result }) => result.clauseRefs))].join(
          "; ",
        ),
    confidence: single
      ? single.confidence
      : Math.min(100, ...perArea.map(({ result }) => result.confidence)),
    manualOverride: false,
    areas: perArea.map(({ roomZoneId, input: areaInput, result }) => ({
      roomZoneId,
      category: result.category,
      class: result.class,
      input: areaInput,
    })),
  };
}
