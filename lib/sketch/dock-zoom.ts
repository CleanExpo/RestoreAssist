import {
  overlayViewportFromVpt,
  overlayViewportToVpt,
  type OverlayViewport,
} from "@/lib/sketch/overlay-viewport";

export const DOCK_ZOOM_MIN = 0.3;
export const DOCK_ZOOM_MAX = 4;

/** The Fabric surface the dock Zoom In/Out/Reset buttons talk to. */
export interface DockZoomCanvas {
  getZoom: () => number;
  setZoom: (z: number) => void;
  setViewportTransform?: (vpt: number[]) => void;
  viewportTransform?: ArrayLike<number> | null;
}

/**
 * Read the overlay vpt from the live canvas after a dock mutation.
 * Copy the matrix so a later Fabric write cannot alias the React snapshot.
 */
export function overlayFromDockCanvas(fc: DockZoomCanvas): OverlayViewport {
  const raw = fc.viewportTransform;
  const copy =
    raw && raw.length >= 6 ? [raw[0], raw[1], raw[2], raw[3], raw[4], raw[5]] : null;
  return overlayViewportFromVpt(copy);
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
  return overlayFromDockCanvas(fc);
}

/**
 * Fit Canvas. Fabric `setZoom(1)` zooms around (0, 0) and leaves leftover
 * pan — pins can jump thousands of pixels from their pre-zoom screen
 * position (Critic measured 2232px). Restore the snapshot taken *before*
 * dock Zoom In/Out, then read the live `viewportTransform` the same way
 * `applyDockZoom` does. No snapshot → identity matrix on both surfaces.
 */
export function resetDockZoom(
  fc: Pick<
    DockZoomCanvas,
    "setZoom" | "setViewportTransform" | "viewportTransform"
  >,
  baseline?: OverlayViewport | null,
): OverlayViewport {
  const matrix = baseline
    ? overlayViewportToVpt(baseline)
    : [1, 0, 0, 1, 0, 0];
  if (typeof fc.setViewportTransform === "function") {
    fc.setViewportTransform(matrix);
  } else {
    fc.setZoom(matrix[0]);
  }
  return overlayFromDockCanvas(fc);
}
