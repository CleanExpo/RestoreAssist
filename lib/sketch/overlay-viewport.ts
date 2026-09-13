/**
 * Map Fabric viewport transform (zoom + pan) onto React pin overlays.
 *
 * Evidence / moisture pins live in a DOM layer above the canvas. Fabric pan/zoom
 * changes `viewportTransform` only — without this mapping the pins stay in
 * screen space while the plan moves underneath (RA-7547).
 */

export interface OverlayViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const IDENTITY_OVERLAY_VIEWPORT: OverlayViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

/** Fabric `viewportTransform` is [scaleX, skewY, skewX, scaleY, translateX, translateY]. */
export function overlayViewportFromVpt(
  vpt: ArrayLike<number> | null | undefined,
): OverlayViewport {
  if (!vpt || vpt.length < 6) return { ...IDENTITY_OVERLAY_VIEWPORT };
  const zoom = Number.isFinite(vpt[0]) && vpt[0] > 0 ? vpt[0] : 1;
  const panX = Number.isFinite(vpt[4]) ? vpt[4] : 0;
  const panY = Number.isFinite(vpt[5]) ? vpt[5] : 0;
  return { zoom, panX, panY };
}

/** Inverse of overlayViewportFromVpt — write this matrix back onto Fabric. */
export function overlayViewportToVpt(v: OverlayViewport): number[] {
  return [v.zoom, 0, 0, v.zoom, v.panX, v.panY];
}

export function overlayScreenPoint(
  sceneX: number,
  sceneY: number,
  vpt: OverlayViewport,
): { left: number; top: number } {
  return {
    left: sceneX * vpt.zoom + vpt.panX,
    top: sceneY * vpt.zoom + vpt.panY,
  };
}

export function overlayScenePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  vpt: OverlayViewport,
): { x: number; y: number } {
  const zoom = vpt.zoom || 1;
  return {
    x: (clientX - rect.left - vpt.panX) / zoom,
    y: (clientY - rect.top - vpt.panY) / zoom,
  };
}
