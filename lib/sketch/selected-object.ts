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
  };
}
