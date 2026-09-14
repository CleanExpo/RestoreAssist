/**
 * Overlay IICRC damage markers onto the report floor-plan page (RA-2953).
 *
 * Markers are a React DOM overlay (SketchDamageMarkerLayer) — they never bake
 * into `renderedPngUrl`. Same contract as moisture / evidence pins: parse the
 * persisted overlay and draw it on the same page as the structural sketch so
 * the report cannot ship a blank/cropped plan without the markers.
 */

import {
  damageMarkerCaption,
  damageMarkerFill,
  parseDamageMarkers,
  type DamageMarker,
  type DamageMarkerSeverity,
  type DamageMarkerType,
} from "@/lib/sketch/damage-markers";

export interface DamageMarkerMapPin {
  id: string;
  type: DamageMarkerType;
  severity: DamageMarkerSeverity;
  nx: number;
  ny: number;
  label: string;
  caption: string;
  color: string;
  room_label: string;
  dimension_m2?: number;
  notes?: string;
}

/**
 * Only markers with normalized `nx`/`ny` in 0..1 are report-placeable.
 * Legacy scene-only pins cannot be mapped without the original canvas size —
 * skip them rather than mis-place (same rule as parseMoisturePins).
 */
export function parseDamageMarkerMap(raw: unknown): DamageMarkerMapPin[] {
  return parseDamageMarkers(raw)
    .filter(
      (m): m is DamageMarker & { nx: number; ny: number } =>
        typeof m.nx === "number" && typeof m.ny === "number",
    )
    .map((m) => ({
      id: m.id,
      type: m.type,
      severity: m.severity,
      nx: m.nx,
      ny: m.ny,
      label: m.type.startsWith("water_")
        ? m.type.replace("water_cat", "C")
        : m.type === "structural"
          ? "St"
          : m.type === "mould"
            ? "Mo"
            : m.type === "smoke"
              ? "Sm"
              : "F",
      caption: damageMarkerCaption(m),
      color: damageMarkerFill(m.type, m.severity),
      room_label: m.room_label,
      ...(m.dimension_m2 !== undefined ? { dimension_m2: m.dimension_m2 } : {}),
      ...(m.notes ? { notes: m.notes } : {}),
    }));
}

export function placeDamageMarkers(
  pins: DamageMarkerMapPin[],
  image: { x: number; y: number; width: number; height: number },
): Array<DamageMarkerMapPin & { cx: number; cy: number }> {
  return pins.map((pin) => ({
    ...pin,
    cx: image.x + pin.nx * image.width,
    cy: image.y + (1 - pin.ny) * image.height,
  }));
}

export function damageMarkersFromSketchData(sketchData: unknown): unknown {
  if (!sketchData || typeof sketchData !== "object" || Array.isArray(sketchData)) {
    return null;
  }
  return (sketchData as { damageMarkers?: unknown }).damageMarkers ?? null;
}
