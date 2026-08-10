/**
 * Wall thickness for sketch stroke / rematerialize band width.
 * Presentation only — centerline geometry stays unchanged.
 */

/** ~110mm internal partition (matches tool-objects default). */
export const WALL_THICKNESS_INTERNAL_M = 0.11;
/** ~230mm external / party wall. */
export const WALL_THICKNESS_EXTERNAL_M = 0.23;

/** Clamp range for operator-editable thickness (metres). */
export const WALL_THICKNESS_MIN_M = 0.05;
export const WALL_THICKNESS_MAX_M = 0.5;

const DEFAULT_PX_PER_METRE = 100;

export function clampWallThicknessM(raw: number): number {
  if (!Number.isFinite(raw)) return WALL_THICKNESS_INTERNAL_M;
  return Math.min(
    WALL_THICKNESS_MAX_M,
    Math.max(WALL_THICKNESS_MIN_M, raw),
  );
}

/**
 * Resolve stroke width in px from optional stored metres.
 * Falls back to internal partition default (~0.11 m).
 */
export function wallThicknessPx(
  wallThicknessM: number | null | undefined,
  pxPerMetre: number = DEFAULT_PX_PER_METRE,
): number {
  const scale = pxPerMetre > 0 ? pxPerMetre : DEFAULT_PX_PER_METRE;
  const metres =
    typeof wallThicknessM === "number" && Number.isFinite(wallThicknessM)
      ? clampWallThicknessM(wallThicknessM)
      : WALL_THICKNESS_INTERNAL_M;
  return metres * scale;
}

/** Read thickness from room/wall Fabric `data` (or default). */
export function readWallThicknessM(
  data: { wallThicknessM?: unknown } | null | undefined,
): number {
  const v = data?.wallThicknessM;
  if (typeof v === "number" && Number.isFinite(v)) {
    return clampWallThicknessM(v);
  }
  return WALL_THICKNESS_INTERNAL_M;
}
