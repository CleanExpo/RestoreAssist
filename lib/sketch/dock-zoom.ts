import {
  overlayViewportFromVpt,
  type OverlayViewport,
} from "@/lib/sketch/overlay-viewport";

export const DOCK_ZOOM_MIN = 0.3;
export const DOCK_ZOOM_MAX = 4;

/** The Fabric surface the dock Zoom In/Out/Reset buttons talk to. */
export interface DockZoomCanvas {
  getZoom: () => number;
  setZoom: (z: number) => void;
  viewportTransform?: ArrayLike<number> | null;
}

/**
 * Dock zoom (RA-7547). Fabric `setZoom` updates `viewportTransform` but does
 * not notify React overlays — callers must apply the returned viewport so
 * photo/moisture pins stay glued to the plan (same source wheel/pan use).
 */
export function applyDockZoom(
  fc: DockZoomCanvas,
  factor: number,
): OverlayViewport {
  const z = Math.max(
    DOCK_ZOOM_MIN,
    Math.min(DOCK_ZOOM_MAX, fc.getZoom() * factor),
  );
  fc.setZoom(z);
  return overlayViewportFromVpt(fc.viewportTransform);
}

export function resetDockZoom(
  fc: Pick<DockZoomCanvas, "setZoom" | "viewportTransform">,
): OverlayViewport {
  fc.setZoom(1);
  return overlayViewportFromVpt(fc.viewportTransform);
}
