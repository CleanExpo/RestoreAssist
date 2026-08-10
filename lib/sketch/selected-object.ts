/**
 * Maps a Fabric.js object (carrying the custom `data` payload) to the
 * SketchSelectionPanel view model. Pure + testable so the canvas selection
 * wiring (which can't be unit-tested without a live Fabric canvas) stays thin.
 */
import type { SelectedObject } from "@/components/sketch/SketchSelectionPanel";

export interface FabricLike {
  type?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  data?: Record<string, unknown>;
}

export function fabricObjectToSelected(
  obj: FabricLike | null | undefined,
): SelectedObject | null {
  const data = obj?.data;
  const id = data?.id;
  if (!data || typeof id !== "string" || id.length === 0) return null;

  return {
    id,
    type: (data.type as string) ?? obj?.type ?? "object",
    label: data.label as string | undefined,
    fill: obj?.fill,
    stroke: obj?.stroke,
    opacity: obj?.opacity,
    materialSlug: data.material as string | undefined,
    whsPathwayNote: data.whsPathwayNote as string | undefined,
    cause: data.cause as SelectedObject["cause"],
    waterCategory: data.waterCategory as SelectedObject["waterCategory"],
    provenance: data.provenance as SelectedObject["provenance"],
    captureAdapter: data.captureAdapter as SelectedObject["captureAdapter"],
    correctionCount: Array.isArray(data.correctionHistory)
      ? data.correctionHistory.length
      : undefined,
    lengthM: typeof data.lengthM === "number" ? data.lengthM : undefined,
    widthM: typeof data.widthM === "number" ? data.widthM : undefined,
    dimLocked: data.dimLocked === true,
    openingKind:
      data.openingKind === "door" ||
      data.openingKind === "window" ||
      data.openingKind === "missing"
        ? data.openingKind
        : undefined,
    wallThicknessM:
      typeof data.wallThicknessM === "number" ? data.wallThicknessM : undefined,
    ceilingHeightM:
      typeof data.ceilingHeightM === "number" ? data.ceilingHeightM : undefined,
  };
}
