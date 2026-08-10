/**
 * Content-aware export crop for floor-plan report PNGs.
 *
 * Full-canvas `toDataURL` leaves large empty void around rooms (especially on
 * wide viewports / after pan-zoom). Encircle-style report pages crop to the
 * measured plan + labels with a small padding so walls, dims, and damage fills
 * fill the PDF frame without letterboxed whitespace.
 */

/** Transient UI chrome that must never drive crop or appear in report PNGs. */
const EXPORT_EXCLUDE_TYPES = new Set([
  "guide",
  "opening-handle",
  "plan-chrome",
  "adjacency-join",
  "short-dim-cta",
]);

export interface ExportBoundObject {
  data?: { type?: string } | null;
  /** Fabric `getBoundingRect()` — viewport/scene AABB after transforms. */
  getBoundingRect?: (absolute?: boolean) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  visible?: boolean;
}

export interface ContentBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropToDataUrlOptions {
  format?: string;
  quality?: number;
  multiplier?: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Default padding around geometry so edge dims / labels are not clipped. */
export const EXPORT_CONTENT_PADDING_PX = 48;

/** Report-quality raster scale (was hard-coded 2× in several callers). */
export const EXPORT_REPORT_MULTIPLIER = 3;

function objectType(obj: ExportBoundObject): string | undefined {
  return obj.data?.type;
}

/**
 * True when the object should contribute to the export crop.
 * Guides / opening handles are editor chrome; everything else (rooms, walls,
 * dims, room labels, damage, measure) stays.
 */
export function isExportCropObject(obj: ExportBoundObject): boolean {
  if (obj.visible === false) return false;
  const t = objectType(obj);
  if (t && EXPORT_EXCLUDE_TYPES.has(t)) return false;
  return true;
}

function objectAabb(obj: ExportBoundObject): ContentBounds | null {
  if (typeof obj.getBoundingRect === "function") {
    // absolute=true → ignore viewport zoom/pan (scene coords).
    const r = obj.getBoundingRect(true);
    if (
      r &&
      Number.isFinite(r.left) &&
      Number.isFinite(r.top) &&
      Number.isFinite(r.width) &&
      Number.isFinite(r.height) &&
      r.width > 0 &&
      r.height > 0
    ) {
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      };
    }
  }
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
  if (!(w > 0 && h > 0)) return null;
  return { left, top, width: w, height: h };
}

/**
 * Axis-aligned union of exportable objects, padded and clamped to the canvas.
 * Returns null when there is no measurable content (empty sketch).
 */
export function computeExportContentBounds(
  objects: ReadonlyArray<ExportBoundObject>,
  canvasWidth: number,
  canvasHeight: number,
  paddingPx = EXPORT_CONTENT_PADDING_PX,
): ContentBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const obj of objects) {
    if (!isExportCropObject(obj)) continue;
    const box = objectAabb(obj);
    if (!box) continue;
    any = true;
    minX = Math.min(minX, box.left);
    minY = Math.min(minY, box.top);
    maxX = Math.max(maxX, box.left + box.width);
    maxY = Math.max(maxY, box.top + box.height);
  }

  if (!any) return null;

  const pad = Math.max(0, paddingPx);
  const left = Math.max(0, Math.floor(minX - pad));
  const top = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(canvasWidth, Math.ceil(maxX + pad));
  const bottom = Math.min(canvasHeight, Math.ceil(maxY + pad));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  // Degenerate / whole-canvas — still return a valid crop (callers may skip).
  return { left, top, width, height };
}

/**
 * Merge crop rect into Fabric `toDataURL` options. When bounds are null
 * (empty canvas), returns the original options unchanged.
 */
export function withExportCrop(
  opts: { format?: string; quality?: number; multiplier?: number } | undefined,
  bounds: ContentBounds | null,
): CropToDataUrlOptions | { format?: string; quality?: number; multiplier?: number } {
  const base = {
    format: opts?.format ?? "png",
    quality: opts?.quality,
    multiplier: opts?.multiplier ?? EXPORT_REPORT_MULTIPLIER,
  };
  if (!bounds) return base;
  return {
    ...base,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * Fit a sketch image into an available PDF content box while preserving aspect
 * ratio. Unlike a hard max-scale of 1, this may upscale so a content-cropped
 * PNG fills the frame (Encircle-style) instead of sitting in empty void.
 */
export function fitSketchImageInBox(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): { drawW: number; drawH: number; scale: number } {
  if (!(imgW > 0 && imgH > 0 && availW > 0 && availH > 0)) {
    return { drawW: 0, drawH: 0, scale: 0 };
  }
  const scale = Math.min(availW / imgW, availH / imgH);
  return {
    scale,
    drawW: imgW * scale,
    drawH: imgH * scale,
  };
}
