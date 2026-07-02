/**
 * Geometry for positioning a floor-plan underlay image on the sketch canvas.
 *
 * The baseline (scale = 1, no offset, aspect locked) reproduces the historical
 * behaviour: the image is fit to the canvas width. A user `scale` multiplier,
 * `offsetX`/`offsetY`, and an `lockAspect` toggle then let the technician line
 * the plan up under their tracing. Kept pure so the canvas and any future report
 * renderer compute the exact same transform.
 */
export interface UnderlayTransformInput {
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  /** User scale multiplier applied on top of the fit-to-width baseline. Default 1. */
  scale?: number;
  /** Horizontal offset in canvas px. Default 0. */
  offsetX?: number;
  /** Vertical offset in canvas px. Default 0. */
  offsetY?: number;
  /** When false, stretch to fill both dimensions instead of fitting width. Default true. */
  lockAspect?: boolean;
}

export interface UnderlayTransform {
  scaleX: number;
  scaleY: number;
  left: number;
  top: number;
}

export function computeUnderlayTransform({
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  lockAspect = true,
}: UnderlayTransformInput): UnderlayTransform {
  // Guard degenerate image sizes (unloaded/broken image) so we never emit
  // NaN/Infinity into Fabric, which would blank the canvas.
  const safeW = imageWidth > 0 ? imageWidth : canvasWidth;
  const safeH = imageHeight > 0 ? imageHeight : canvasHeight;

  const fitWidthScale = (canvasWidth / safeW) * scale;
  const scaleX = fitWidthScale;
  const scaleY = lockAspect ? fitWidthScale : (canvasHeight / safeH) * scale;

  return { scaleX, scaleY, left: offsetX, top: offsetY };
}
