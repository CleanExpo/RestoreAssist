/**
 * IICRC S500:2025 Inspection Photo Label Schema — RA-446
 * Do NOT modify enum values without updating schema.prisma and UI pickers.
 * All values stored as TEXT / TEXT[] in PostgreSQL (no DB-level enums).
 *
 * Spec: PROJECTS/RestoreAssist/INSPECTION-IMAGE-SCHEMA.md §6
 */

// ---------------------------------------------------------------------------
// Enums (union types — stored as plain strings in DB)
// ---------------------------------------------------------------------------

/** S500:2025 §10 — Water contamination category */
export type DamageCategory = 'CAT_1' | 'CAT_2' | 'CAT_3';

/** S500:2025 §11 — Evaporative load class */
export type DamageClass = 'CLASS_1' | 'CLASS_2' | 'CLASS_3' | 'CLASS_4';

export type RoomType =
  | 'KITCHEN' | 'BATHROOM' | 'LAUNDRY' | 'TOILET' | 'BEDROOM'
  | 'LIVING' | 'DINING' | 'HALLWAY' | 'GARAGE' | 'ROOF_SPACE'
  | 'SUBFLOOR' | 'BASEMENT' | 'COMMERCIAL_OFFICE' | 'COMMERCIAL_WAREHOUSE'
  | 'COMMON_AREA' | 'EXTERNAL' | 'OTHER';

export type MoistureSource =
  | 'FLEXI_HOSE' | 'TAP_FAILURE' | 'PIPE_BURST' | 'PIPE_LEAK'
  | 'ROOF_LEAK' | 'STORMWATER' | 'SEWAGE_OVERFLOW' | 'WASHING_MACHINE'
  | 'DISHWASHER' | 'HOT_WATER_SYSTEM' | 'AIR_CON_DRAIN' | 'FLOOD_EXTERNAL'
  | 'RISING_DAMP' | 'CONDENSATION' | 'UNKNOWN' | 'OTHER';

export type AffectedMaterial =
  | 'PLASTERBOARD' | 'VILLABOARD' | 'FIBRE_CEMENT_SHEET' | 'TIMBER_FRAME'
  | 'TIMBER_FLOORING' | 'PARTICLE_BOARD_FLOOR' | 'PLYWOOD_SUBFLOOR'
  | 'SLAB_ON_GROUND' | 'BRICK_VENEER' | 'DOUBLE_BRICK' | 'TERRACOTTA_TILE'
  | 'VINYL_FLOORING' | 'CARPET' | 'INSULATION_BATTS' | 'INSULATION_FOAM'
  | 'CORNICE' | 'RENDER' | 'CABINETRY' | 'OTHER';

export type SurfaceOrientation =
  | 'FLOOR' | 'WALL_LOWER' | 'WALL_MID' | 'WALL_UPPER' | 'CEILING'
  | 'JUNCTION' | 'COLUMN_PIER' | 'SUBFLOOR_BEARER' | 'ROOF_RAFTER';

export type DamageExtentEstimate =
  | 'SPOT' | 'PARTIAL' | 'MAJORITY' | 'FULL' | 'UNCERTAIN';

/** Multi-select — S500:2025 §16 secondary indicators; may be empty [] */
export type SecondaryDamageIndicator =
  | 'MOULD_VISIBLE' | 'MOULD_ODOUR' | 'EFFLORESCENCE' | 'STAINING_RUST'
  | 'STAINING_TANNIN' | 'DELAMINATION' | 'BUCKLING' | 'SWELLING' | 'PEELING'
  | 'CEILING_SAG' | 'INSULATION_COLLAPSE' | 'SUBFLOOR_STANDING'
  | 'CONTAMINATION_SEWAGE' | 'TERMITE_DAMAGE' | 'ASBESTOS_SUSPECT';

export type PhotoStage =
  | 'PRE_WORK' | 'DURING_WORK' | 'MONITORING' | 'POST_WORK' | 'REINSTATEMENT';

export type CaptureAngle =
  | 'STRAIGHT_ON' | 'OBLIQUE' | 'OVERHEAD' | 'MACRO' | 'WIDE';

export type LabelledBy =
  | 'HUMAN_TECH' | 'HUMAN_OFFICE' | 'AI_ASSISTED' | 'AI_AUTO';

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface InspectionPhotoLabel {
  // Required fields (13)
  damageCategory:            DamageCategory;
  damageClass:               DamageClass;
  s500SectionRef:            string;              // e.g. "§13.1"
  roomType:                  RoomType;
  moistureSource:            MoistureSource;
  affectedMaterial:          AffectedMaterial[];  // min 1 item
  surfaceOrientation:        SurfaceOrientation;
  damageExtentEstimate:      DamageExtentEstimate;
  equipmentVisible:          boolean;
  secondaryDamageIndicators: SecondaryDamageIndicator[]; // may be []
  photoStage:                PhotoStage;
  captureAngle:              CaptureAngle;
  labelledBy:                LabelledBy;
  // Optional fields (2)
  technicianNotes?:          string;
  moistureReadingLink?:      string;              // UUID of linked MoistureReading
}

/** Partial version used for PATCH / edit-label flows */
export type InspectionPhotoLabelPatch = Partial<InspectionPhotoLabel>;

// ---------------------------------------------------------------------------
// S500 auto-suggest map: [damageCategory][photoStage] → s500SectionRef
// ---------------------------------------------------------------------------

export const S500_AUTO_SUGGEST: Record<DamageCategory, Partial<Record<PhotoStage, string>>> = {
  CAT_1: {
    PRE_WORK:      '§13.1',
    DURING_WORK:   '§14.1',
    MONITORING:    '§14.3',
    POST_WORK:     '§15.1',
    REINSTATEMENT: '§15.1',
  },
  CAT_2: {
    PRE_WORK:      '§13.1',
    DURING_WORK:   '§14.1',
    MONITORING:    '§14.3',
    POST_WORK:     '§15.1',
    REINSTATEMENT: '§15.1',
  },
  CAT_3: {
    PRE_WORK:      '§16.2',
    DURING_WORK:   '§16.2',
    MONITORING:    '§16.2',
    POST_WORK:     '§15.1',
    REINSTATEMENT: '§15.1',
  },
};

// ---------------------------------------------------------------------------
// Stop-work indicator utility — RA-446 / Safe Work Australia
// ---------------------------------------------------------------------------

/**
 * The single secondary damage indicator that triggers mandatory
 * Stop Work advisory in the RestoreAssist UI (Safe Work Australia guidance).
 * Do NOT proceed with demolition or disturbance if this is flagged.
 */
export const ASBESTOS_STOP_WORK_INDICATOR: SecondaryDamageIndicator = 'ASBESTOS_SUSPECT';

/**
 * Returns true if the photo label set contains ASBESTOS_SUSPECT.
 * Use this guard before allowing any invasive work continuation in the UI.
 */
export function hasStopWorkIndicator(
  label: Pick<InspectionPhotoLabel, 'secondaryDamageIndicators'>,
): boolean {
  return label.secondaryDamageIndicators.includes(ASBESTOS_STOP_WORK_INDICATOR);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** S500:2025 §10.3 cross-field rule: sewage contamination → must be CAT_3 */
export function validateCrossFieldRules(
  label: Partial<InspectionPhotoLabel>,
): string[] {
  const errors: string[] = [];

  if (
    label.secondaryDamageIndicators?.includes('CONTAMINATION_SEWAGE') &&
    label.damageCategory !== 'CAT_3'
  ) {
    errors.push(
      'CONTAMINATION_SEWAGE requires damageCategory CAT_3 (S500:2025 §10.3)',
    );
  }

  if (label.affectedMaterial && label.affectedMaterial.length === 0) {
    errors.push('affectedMaterial must contain at least one item');
  }

  const s500Pattern = /^§\d+\.\d+(\.\d+)?$/;
  if (label.s500SectionRef && !s500Pattern.test(label.s500SectionRef)) {
    errors.push('s500SectionRef must match pattern §XX.X or §XX.X.X');
  }

  return errors;
}
