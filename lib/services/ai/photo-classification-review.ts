/**
 * RA-7613 — technician accept / reject / confirm for photo auto-classify results.
 *
 * Accepted labels enter job data as `ai_suggested` (RA-7611 allow-list) and
 * produce zero billable quantities until a person confirms them. Rejected
 * labels never copy into the labelled columns. Confirming promotes provenance
 * to `operator_measured`, matching Vision-room Confirm.
 *
 * No schema change: review state lives on InspectionPhoto.metadata.photoAi
 * alongside the existing aiLabels JSON column.
 */

import {
  AI_SUGGESTED_PROVENANCE,
  OPERATOR_MEASURED_PROVENANCE,
  isOperatorMeasuredProvenance,
} from "@/lib/sketch/measured-provenance";
import {
  PHOTO_AI_METADATA_KEY,
  applyAiAcmLatch,
  classificationHasSuspectedAcm,
  emptyAiAcmLatch,
  readPhotoAiLatch,
  type AiAcmLatch,
} from "@/lib/anz/photo-ai-whs";

export type PhotoClassificationReviewStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "confirmed";

export type PhotoClassificationDecision = "accept" | "reject" | "confirm";

export interface PhotoClassificationResult {
  status: PhotoClassificationReviewStatus;
  provenance: typeof AI_SUGGESTED_PROVENANCE | typeof OPERATOR_MEASURED_PROVENANCE;
  labelledBy: "AI_ASSISTED" | "HUMAN_TECH" | "AI_AUTO";
  fields: Record<string, unknown> | null;
  suggestedAreaM2: number | null;
  suspectedAcm: boolean;
}

export interface PhotoAiMetadata {
  reviewStatus: PhotoClassificationReviewStatus;
  provenance:
    | typeof AI_SUGGESTED_PROVENANCE
    | typeof OPERATOR_MEASURED_PROVENANCE;
  labelledBy: PhotoClassificationResult["labelledBy"];
  acceptedLabels: Record<string, unknown> | null;
  suggestedAreaM2: number | null;
  whsLatch: AiAcmLatch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function labelsRecord(labels: unknown): Record<string, unknown> {
  return asRecord(labels) ?? {};
}

function readSuggestedArea(labels: Record<string, unknown>): number | null {
  const n = labels.suggestedAreaM2;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export function acceptPhotoClassification(
  labels: Record<string, unknown>,
): PhotoClassificationResult {
  const fields = { ...labels };
  return {
    status: "accepted",
    provenance: AI_SUGGESTED_PROVENANCE,
    labelledBy: "AI_ASSISTED",
    fields,
    suggestedAreaM2: readSuggestedArea(fields),
    suspectedAcm: classificationHasSuspectedAcm(fields),
  };
}

export function rejectPhotoClassification(
  labels: Record<string, unknown>,
): PhotoClassificationResult {
  return {
    status: "rejected",
    provenance: AI_SUGGESTED_PROVENANCE,
    labelledBy: "AI_AUTO",
    fields: null,
    suggestedAreaM2: readSuggestedArea(labels),
    suspectedAcm: classificationHasSuspectedAcm(labels),
  };
}

export function confirmPhotoClassification(
  accepted: PhotoClassificationResult,
): PhotoClassificationResult {
  if (accepted.status !== "accepted" || accepted.fields == null) {
    return accepted;
  }
  return {
    ...accepted,
    status: "confirmed",
    provenance: OPERATOR_MEASURED_PROVENANCE,
    labelledBy: "HUMAN_TECH",
  };
}

export function reviewPhotoClassification(
  labels: Record<string, unknown>,
  decision: PhotoClassificationDecision,
  previous?: PhotoClassificationResult | null,
): PhotoClassificationResult {
  if (decision === "accept") return acceptPhotoClassification(labels);
  if (decision === "reject") return rejectPhotoClassification(labels);
  return confirmPhotoClassification(
    previous ?? acceptPhotoClassification(labels),
  );
}

/**
 * Billable quantity for an accepted/confirmed photo result.
 * Unconfirmed `ai_suggested` (and rejected) results are always zero.
 */
export function billableQuantityForPhotoResult(
  result: PhotoClassificationResult,
): number {
  if (result.status !== "confirmed") return 0;
  if (!isOperatorMeasuredProvenance(result.provenance)) return 0;
  return result.suggestedAreaM2 ?? 0;
}

const DAMAGE_CATEGORIES = new Set(["CAT_1", "CAT_2", "CAT_3"]);
const DAMAGE_CLASSES = new Set(["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"]);
const ROOM_TYPES = new Set([
  "KITCHEN",
  "BATHROOM",
  "LAUNDRY",
  "TOILET",
  "BEDROOM",
  "LIVING",
  "DINING",
  "HALLWAY",
  "GARAGE",
  "ROOF_SPACE",
  "SUBFLOOR",
  "BASEMENT",
  "COMMERCIAL_OFFICE",
  "COMMERCIAL_WAREHOUSE",
  "COMMON_AREA",
  "EXTERNAL",
  "OTHER",
]);
const MOISTURE_SOURCES = new Set([
  "FLEXI_HOSE",
  "TAP_FAILURE",
  "PIPE_BURST",
  "PIPE_LEAK",
  "ROOF_LEAK",
  "STORMWATER",
  "SEWAGE_OVERFLOW",
  "WASHING_MACHINE",
  "DISHWASHER",
  "HOT_WATER_SYSTEM",
  "AIR_CON_DRAIN",
  "FLOOD_EXTERNAL",
  "RISING_DAMP",
  "CONDENSATION",
  "UNKNOWN",
  "OTHER",
]);
const AFFECTED_MATERIALS = new Set([
  "PLASTERBOARD",
  "VILLABOARD",
  "FIBRE_CEMENT_SHEET",
  "TIMBER_FRAME",
  "TIMBER_FLOORING",
  "PARTICLE_BOARD_FLOOR",
  "PLYWOOD_SUBFLOOR",
  "SLAB_ON_GROUND",
  "BRICK_VENEER",
  "DOUBLE_BRICK",
  "TERRACOTTA_TILE",
  "VINYL_FLOORING",
  "CARPET",
  "INSULATION_BATTS",
  "INSULATION_FOAM",
  "CORNICE",
  "RENDER",
  "CABINETRY",
  "OTHER",
]);
const SURFACE_ORIENTATIONS = new Set([
  "FLOOR",
  "WALL_LOWER",
  "WALL_MID",
  "WALL_UPPER",
  "CEILING",
  "JUNCTION",
  "COLUMN_PIER",
  "SUBFLOOR_BEARER",
  "ROOF_RAFTER",
]);
const DAMAGE_EXTENTS = new Set([
  "SPOT",
  "PARTIAL",
  "MAJORITY",
  "FULL",
  "UNCERTAIN",
]);
const SECONDARY_INDICATORS = new Set([
  "MOULD_VISIBLE",
  "MOULD_ODOUR",
  "EFFLORESCENCE",
  "STAINING_RUST",
  "STAINING_TANNIN",
  "DELAMINATION",
  "BUCKLING",
  "SWELLING",
  "PEELING",
  "CEILING_SAG",
  "INSULATION_COLLAPSE",
  "SUBFLOOR_STANDING",
  "CONTAMINATION_SEWAGE",
  "TERMITE_DAMAGE",
  "ASBESTOS_SUSPECT",
]);
const PHOTO_STAGES = new Set([
  "PRE_WORK",
  "DURING_WORK",
  "MONITORING",
  "POST_WORK",
  "REINSTATEMENT",
]);
const CAPTURE_ANGLES = new Set([
  "STRAIGHT_ON",
  "OBLIQUE",
  "OVERHEAD",
  "MACRO",
  "WIDE",
]);

function pickEnum(value: unknown, allowed: Set<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  return allowed.has(value) ? value : undefined;
}

function pickEnumList(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && allowed.has(item),
  );
}

/**
 * Copy classifier JSON onto InspectionPhoto label columns, keeping only
 * values the RA-446 schema already stores. Unknown tokens are dropped
 * rather than guessed into a neighbouring enum.
 */
export function photoAiLabelsToColumnPatch(
  labels: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const damageCategory = pickEnum(labels.damageCategory, DAMAGE_CATEGORIES);
  if (damageCategory) patch.damageCategory = damageCategory;
  const damageClass = pickEnum(labels.damageClass, DAMAGE_CLASSES);
  if (damageClass) patch.damageClass = damageClass;
  const roomType = pickEnum(labels.roomType, ROOM_TYPES);
  if (roomType) patch.roomType = roomType;
  const moistureSource = pickEnum(labels.moistureSource, MOISTURE_SOURCES);
  if (moistureSource) patch.moistureSource = moistureSource;
  const affectedMaterial = pickEnumList(
    labels.affectedMaterial,
    AFFECTED_MATERIALS,
  );
  if (affectedMaterial.length > 0) patch.affectedMaterial = affectedMaterial;
  const surfaceOrientation = pickEnum(
    labels.surfaceOrientation,
    SURFACE_ORIENTATIONS,
  );
  if (surfaceOrientation) patch.surfaceOrientation = surfaceOrientation;
  const damageExtentEstimate = pickEnum(
    labels.damageExtentEstimate,
    DAMAGE_EXTENTS,
  );
  if (damageExtentEstimate) patch.damageExtentEstimate = damageExtentEstimate;
  const secondaryDamageIndicators = pickEnumList(
    labels.secondaryDamageIndicators,
    SECONDARY_INDICATORS,
  );
  if (secondaryDamageIndicators.length > 0) {
    patch.secondaryDamageIndicators = secondaryDamageIndicators;
  }
  const photoStage = pickEnum(labels.photoStage, PHOTO_STAGES);
  if (photoStage) patch.photoStage = photoStage;
  const captureAngle = pickEnum(labels.captureAngle, CAPTURE_ANGLES);
  if (captureAngle) patch.captureAngle = captureAngle;
  if (typeof labels.equipmentVisible === "boolean") {
    patch.equipmentVisible = labels.equipmentVisible;
  }
  return patch;
}

export function readPhotoAiMetadata(metadata: unknown): PhotoAiMetadata {
  const root = asRecord(metadata);
  const photoAi = asRecord(root?.[PHOTO_AI_METADATA_KEY]);
  const status = photoAi?.reviewStatus;
  const reviewStatus: PhotoClassificationReviewStatus =
    status === "accepted" ||
    status === "rejected" ||
    status === "confirmed" ||
    status === "pending"
      ? status
      : "pending";
  const provenance =
    photoAi?.provenance === OPERATOR_MEASURED_PROVENANCE
      ? OPERATOR_MEASURED_PROVENANCE
      : AI_SUGGESTED_PROVENANCE;
  const labelledBy =
    photoAi?.labelledBy === "HUMAN_TECH" ||
    photoAi?.labelledBy === "AI_ASSISTED" ||
    photoAi?.labelledBy === "AI_AUTO"
      ? photoAi.labelledBy
      : "AI_AUTO";
  const area = photoAi?.suggestedAreaM2;
  return {
    reviewStatus,
    provenance,
    labelledBy,
    acceptedLabels: asRecord(photoAi?.acceptedLabels),
    suggestedAreaM2:
      typeof area === "number" && Number.isFinite(area) && area > 0 ? area : null,
    whsLatch: readPhotoAiLatch(metadata),
  };
}

export function mergePhotoAiMetadata(
  existingMetadata: unknown,
  result: PhotoClassificationResult,
  classifierLabels?: unknown,
): Record<string, unknown> {
  const root = { ...(asRecord(existingMetadata) ?? {}) };
  const previous = readPhotoAiMetadata(root);
  const labelsForLatch = classifierLabels ?? result.fields ?? {};
  const whsLatch = applyAiAcmLatch(previous.whsLatch, labelsForLatch);
  root[PHOTO_AI_METADATA_KEY] = {
    reviewStatus: result.status,
    provenance: result.provenance,
    labelledBy: result.labelledBy,
    acceptedLabels: result.fields,
    suggestedAreaM2: result.suggestedAreaM2,
    whsLatch,
  };
  return root;
}

/** Stamp a classify run onto metadata: new labels go pending; ACM latch can only rise. */
export function stampClassifierRunOnMetadata(
  existingMetadata: unknown,
  labels: unknown,
): Record<string, unknown> {
  const root = { ...(asRecord(existingMetadata) ?? {}) };
  const previous = readPhotoAiMetadata(root);
  root[PHOTO_AI_METADATA_KEY] = {
    reviewStatus: "pending",
    provenance: AI_SUGGESTED_PROVENANCE,
    labelledBy: "AI_AUTO",
    acceptedLabels: null,
    suggestedAreaM2: readSuggestedArea(labelsRecord(labels)),
    whsLatch: applyAiAcmLatch(previous.whsLatch, labels),
  };
  return root;
}

export function photoAiMetadataFromResult(
  result: PhotoClassificationResult,
  existingLatch: AiAcmLatch = emptyAiAcmLatch(),
): PhotoAiMetadata {
  return {
    reviewStatus: result.status,
    provenance: result.provenance,
    labelledBy: result.labelledBy,
    acceptedLabels: result.fields,
    suggestedAreaM2: result.suggestedAreaM2,
    whsLatch: applyAiAcmLatch(existingLatch, result.fields ?? {}),
  };
}
