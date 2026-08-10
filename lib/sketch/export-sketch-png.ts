/**
 * RA-6847 [C1] — export firewall + report-quality crop.
 *
 * The imported floor-plan underlay is applied as the Fabric canvas
 * `backgroundImage` — an orientation-only `underlay_reference` layer. Per
 * spec §8.1 and `au-ip-opinion-brief.md`, that layer must be "faded,
 * watermarked and NEVER exported". But `canvas.toDataURL()` renders the
 * background, so a naive export would leak the imported plan into the report
 * PNG.
 *
 * This exports with the underlay removed: it detaches `backgroundImage`,
 * resets viewport zoom/pan so crop coords match scene geometry, hides editor
 * chrome (guides / opening handles), crops to content bounds, captures the
 * PNG (operator-traced geometry only), then restores on-screen state.
 */

import {
  computeExportContentBounds,
  withExportCrop,
  EXPORT_REPORT_MULTIPLIER,
  type ExportBoundObject,
} from "@/lib/sketch/export-content-bounds";

/** Minimal Fabric-canvas surface this helper needs — kept framework-free so it is unit-testable. */
export interface ExportableCanvas {
  backgroundImage?: unknown;
  toDataURL: (opts?: object) => string;
  renderAll: () => void;
  requestRenderAll?: () => void;
  getObjects?: () => ExportBoundObject[];
  getWidth?: () => number;
  getHeight?: () => number;
  width?: number;
  height?: number;
  viewportTransform?: number[] | Float32Array | null;
  setViewportTransform?: (vpt: number[]) => void;
  discardActiveObject?: () => void;
}

export interface ExportPngOptions {
  format?: string;
  quality?: number;
  multiplier?: number;
  /** Skip content crop (full canvas). Default false — crop for report fidelity. */
  skipCrop?: boolean;
  /** Padding around geometry when cropping. */
  paddingPx?: number;
  /**
   * Explicit crop rect (e.g. room moisture map). When set, overrides
   * auto content bounds (still respects skipCrop).
   */
  cropBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}

const IDENTITY_VPT = [1, 0, 0, 1, 0, 0];

function render(c: ExportableCanvas): void {
  if (typeof c.requestRenderAll === "function") c.requestRenderAll();
  else c.renderAll();
}

function canvasSize(c: ExportableCanvas): { w: number; h: number } {
  const w =
    typeof c.getWidth === "function" ? c.getWidth() : (c.width ?? 0);
  const h =
    typeof c.getHeight === "function" ? c.getHeight() : (c.height ?? 0);
  return { w, h };
}

type ChromeSnapshot = { obj: ExportBoundObject; visible: boolean };

function hideExportChrome(objects: ExportBoundObject[]): ChromeSnapshot[] {
  const snapped: ChromeSnapshot[] = [];
  for (const obj of objects) {
    const t = obj.data?.type;
    if (
      t === "guide" ||
      t === "opening-handle" ||
      t === "plan-chrome" ||
      t === "adjacency-join" ||
      t === "short-dim-cta"
    ) {
      snapped.push({ obj, visible: obj.visible !== false });
      obj.visible = false;
    }
  }
  return snapped;
}

function restoreExportChrome(snapped: ChromeSnapshot[]): void {
  for (const { obj, visible } of snapped) {
    obj.visible = visible;
  }
}

/**
 * PNG data URL of the canvas WITHOUT the underlay background, cropped to
 * measured content when possible. Background + viewport + chrome visibility
 * are always restored, even if `toDataURL` throws.
 */
export function exportSketchPng(
  canvas: ExportableCanvas,
  opts?: ExportPngOptions,
): string {
  const savedBg = canvas.backgroundImage;
  const hadBackground = savedBg != null;
  const savedVpt = canvas.viewportTransform
    ? Array.from(canvas.viewportTransform)
    : null;
  const objects =
    typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
  const chrome = hideExportChrome(objects);

  try {
    if (hadBackground) canvas.backgroundImage = null;
    if (typeof canvas.discardActiveObject === "function") {
      canvas.discardActiveObject();
    }
    if (typeof canvas.setViewportTransform === "function") {
      canvas.setViewportTransform(IDENTITY_VPT.slice());
    }

    render(canvas);

    const { w, h } = canvasSize(canvas);
    const bounds =
      opts?.skipCrop || w <= 0 || h <= 0
        ? null
        : opts?.cropBounds
          ? {
              left: opts.cropBounds.left,
              top: opts.cropBounds.top,
              width: Math.max(1, opts.cropBounds.width),
              height: Math.max(1, opts.cropBounds.height),
            }
          : computeExportContentBounds(objects, w, h, opts?.paddingPx);

    const toDataOpts = withExportCrop(
      {
        format: opts?.format ?? "png",
        quality: opts?.quality,
        multiplier: opts?.multiplier ?? EXPORT_REPORT_MULTIPLIER,
      },
      bounds,
    );

    return canvas.toDataURL(toDataOpts);
  } finally {
    if (hadBackground) canvas.backgroundImage = savedBg;
    if (savedVpt && typeof canvas.setViewportTransform === "function") {
      canvas.setViewportTransform(savedVpt);
    }
    restoreExportChrome(chrome);
    render(canvas);
  }
}

export { EXPORT_REPORT_MULTIPLIER };
