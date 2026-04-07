/**
 * NIR Tiered Completion Model
 *
 * Implements the tiered completion model from nir-field-reality-spec.ts:
 *   CRITICAL    — must be present before submission is accepted
 *   SUPPLEMENTARY — should be present; flagged in report but do NOT block submission
 *
 * The core principle: a safe partial record in an emergency is better than
 * no record at all. A technician in a flooded basement with one hand occupied
 * and no connectivity must be able to submit the critical fields and sync
 * the rest when conditions allow.
 *
 * This module is the single source of truth for field tier classification.
 * Used by:
 *   - app/api/inspections/[id]/submit/route.ts  (server-side gate)
 *   - lib/nir-verification-checklist.ts          (report flagging)
 *   - (future) portal field form validation      (client-side UX feedback)
 *
 * Critique addressed: C4 — Field conditions not addressed in app design
 * Source: lib/nir-field-reality-spec.ts → PHYSICAL_UX_REQUIREMENTS.tieredCompletion
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type FieldTier = "critical" | "supplementary";

export interface TieredField {
  /** The field name as it appears on the inspection record */
  fieldName: string;
  /** Human-readable label for error messages and reports */
  label: string;
  /** IICRC clause that mandates this field, if applicable */
  clauseRef?: string;
  /** Why this field has this tier classification */
  rationale: string;
}

export interface TieredCompletionResult {
  /** Whether the inspection may be submitted */
  canSubmit: boolean;
  /** Critical fields that are missing — submission is blocked until resolved */
  missingCritical: TieredField[];
  /** Supplementary fields that are absent — submission proceeds, flagged in report */
  missingSupplementary: TieredField[];
  /**
   * Advisory warnings — data is present but has quality concerns
   * (e.g. only one photo, moisture readings below minimum)
   */
  warnings: string[];
  /** Human-readable summary for API response */
  summary: string;
}

// ─── FIELD DEFINITIONS ────────────────────────────────────────────────────────

/**
 * CRITICAL fields — block submission until present.
 * Chosen because their absence makes the report legally or technically
 * unusable for insurance claims processing.
 */
export const CRITICAL_FIELDS: TieredField[] = [
  {
    fieldName: "propertyAddress",
    label: "Property address",
    rationale:
      "Without a verifiable address the report cannot be linked to a policy or claim.",
  },
  {
    fieldName: "propertyPostcode",
    label: "Property postcode",
    rationale:
      "Postcode drives jurisdictional matrix and building code requirements. Cannot be derived from address alone.",
  },
  {
    fieldName: "inspectionDate",
    label: "Inspection date",
    rationale:
      "Required for IICRC time-escalation logic (S500 §7.1 — 48hr Cat 1→2 degradation). Absence invalidates classification.",
  },
  {
    fieldName: "affectedAreas",
    label: "At least one affected area",
    clauseRef: "IICRC S500 §8.1–8.4",
    rationale:
      "Affected area is required to determine water class. No area = no scope = report is incomplete.",
  },
  {
    fieldName: "waterSource",
    label: "Water source / loss type",
    clauseRef: "IICRC S500 §7.1–7.3",
    rationale:
      "Water source determines Category (1/2/3). Absent = no classification possible = no scope.",
  },
  {
    fieldName: "photos",
    label: "At least one photo",
    clauseRef: "IICRC S500 §5.3",
    rationale:
      "S500 §5.3 requires photo documentation as a minimum. One photo is the absolute floor for a submittable report.",
  },
];

/**
 * SUPPLEMENTARY fields — absence flagged in report but submission proceeds.
 * These are important for a complete report but their absence in the field
 * is a known reality in emergency conditions.
 */
export const SUPPLEMENTARY_FIELDS: TieredField[] = [
  {
    fieldName: "environmentalData",
    label: "Environmental data (temperature, humidity)",
    clauseRef: "IICRC S500 §12.4",
    rationale:
      "Required for drying target calculation (S500 §12.4) but can be captured at reinspection if equipment unavailable.",
  },
  {
    fieldName: "moistureReadings",
    label: "Moisture readings",
    clauseRef: "IICRC S500 §12.3",
    rationale:
      "Critical for classification accuracy but a partial set is acceptable in emergency conditions. Flagged for follow-up.",
  },
  {
    fieldName: "equipmentSerialNumbers",
    label: "Equipment serial numbers",
    clauseRef: "IICRC S500 §14",
    rationale:
      "S500 §14 requires equipment documentation but serial numbers can be recorded at placement.",
  },
  {
    fieldName: "scopeItems",
    label: "Full scope line items",
    rationale:
      "Auto-generated from classification. If classification is present, scope can be generated post-submission.",
  },
  {
    fieldName: "technicianSignature",
    label: "Technician signature",
    rationale:
      "Required for final report but may be captured digitally after field work is complete.",
  },
];

// ─── INSPECTION SHAPE (for validation) ───────────────────────────────────────

/**
 * The subset of an inspection record used for tiered completion validation.
 * Typed to avoid `any` — matches the Prisma inspection shape with includes.
 */
export interface InspectionForTieredValidation {
  propertyAddress?: string | null;
  propertyPostcode?: string | null;
  inspectionDate?: Date | string | null;
  affectedAreas?: unknown[];
  photos?: unknown[];
  environmentalData?: unknown | null;
  moistureReadings?: unknown[];
  scopeItems?: unknown[];
  /** Water source is on affectedAreas in the schema */
  affectedAreasWithSource?: Array<{ waterSource?: string | null }>;
}

// ─── VALIDATION FUNCTION ──────────────────────────────────────────────────────

/**
 * Validate an inspection against the tiered completion model.
 *
 * @param inspection - The inspection record (from Prisma with includes)
 * @returns TieredCompletionResult — canSubmit + field gap lists + warnings
 *
 * @example
 *   const result = validateTieredCompletion(inspection)
 *   if (!result.canSubmit) {
 *     return NextResponse.json({ error: result.summary, missingCritical: result.missingCritical }, { status: 400 })
 *   }
 */
export function validateTieredCompletion(
  inspection: InspectionForTieredValidation,
): TieredCompletionResult {
  const missingCritical: TieredField[] = [];
  const missingSupplementary: TieredField[] = [];
  const warnings: string[] = [];

  // ─── Critical field checks ─────────────────────────────────────────────────

  if (!inspection.propertyAddress?.trim()) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "propertyAddress")!,
    );
  }

  if (!inspection.propertyPostcode?.trim()) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "propertyPostcode")!,
    );
  }

  if (!inspection.inspectionDate) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "inspectionDate")!,
    );
  }

  if (!inspection.affectedAreas || inspection.affectedAreas.length === 0) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "affectedAreas")!,
    );
  }

  // Water source check — derived from first affected area
  const hasWaterSource = inspection.affectedAreasWithSource?.some(
    (a) => !!a.waterSource,
  );
  if (!hasWaterSource) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "waterSource")!,
    );
  }

  if (!inspection.photos || inspection.photos.length === 0) {
    missingCritical.push(
      CRITICAL_FIELDS.find((f) => f.fieldName === "photos")!,
    );
  }

  // ─── Supplementary field checks ────────────────────────────────────────────

  if (!inspection.environmentalData) {
    missingSupplementary.push(
      SUPPLEMENTARY_FIELDS.find((f) => f.fieldName === "environmentalData")!,
    );
  }

  if (
    !inspection.moistureReadings ||
    inspection.moistureReadings.length === 0
  ) {
    missingSupplementary.push(
      SUPPLEMENTARY_FIELDS.find((f) => f.fieldName === "moistureReadings")!,
    );
  }

  if (!inspection.scopeItems || inspection.scopeItems.length === 0) {
    missingSupplementary.push(
      SUPPLEMENTARY_FIELDS.find((f) => f.fieldName === "scopeItems")!,
    );
  }

  // ─── Quality warnings (data present but quality concerns) ──────────────────

  const photoCount = inspection.photos?.length ?? 0;
  if (photoCount === 1) {
    warnings.push(
      "Only 1 photo recorded. S500 §5.3 requires overview, affected areas, moisture meter placement, and equipment placement photos. Additional photos required before final report.",
    );
  }

  const moistureCount = inspection.moistureReadings?.length ?? 0;
  const areaCount = inspection.affectedAreas?.length ?? 0;
  if (moistureCount > 0 && areaCount > 0 && moistureCount < areaCount) {
    warnings.push(
      `${moistureCount} moisture reading(s) recorded across ${areaCount} affected area(s). At least one reading per area is recommended per S500 §12.3.`,
    );
  }

  if (!inspection.environmentalData && moistureCount > 0) {
    warnings.push(
      "Moisture readings present but no environmental data (temperature/humidity). Drying target calculation (S500 §12.4) requires ambient conditions — record at reinspection.",
    );
  }

  // ─── Result ────────────────────────────────────────────────────────────────

  const canSubmit = missingCritical.length === 0;

  const summaryParts: string[] = [];
  if (!canSubmit) {
    summaryParts.push(
      `${missingCritical.length} critical field(s) missing — submission blocked: ${missingCritical.map((f) => f.label).join(", ")}.`,
    );
  }
  if (missingSupplementary.length > 0) {
    summaryParts.push(
      `${missingSupplementary.length} supplementary field(s) absent — flagged in report for follow-up: ${missingSupplementary.map((f) => f.label).join(", ")}.`,
    );
  }
  if (warnings.length > 0) {
    summaryParts.push(`${warnings.length} quality warning(s).`);
  }
  if (canSubmit && summaryParts.length === 0) {
    summaryParts.push("All fields complete. Inspection ready for submission.");
  }

  return {
    canSubmit,
    missingCritical,
    missingSupplementary,
    warnings,
    summary: summaryParts.join(" "),
  };
}
