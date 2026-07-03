/**
 * RA-6847 [C1] — export firewall.
 *
 * The imported floor-plan underlay is applied as the Fabric canvas
 * `backgroundImage` — an orientation-only `underlay_reference` layer. Per
 * spec §8.1 and `au-ip-opinion-brief.md`, that layer must be "faded,
 * watermarked and NEVER exported". But `canvas.toDataURL()` renders the
 * background, so a naive export would leak the imported plan into the report
 * PNG.
 *
 * This exports with the underlay removed: it detaches `backgroundImage`,
 * re-renders, captures the PNG (operator-traced geometry only), then restores
 * the background so the on-screen trace-over view is unchanged. The measured
 * *data* paths (extractRooms etc.) already self-filter `underlay_reference`;
 * this closes the remaining IMAGE leak.
 */

/** Minimal Fabric-canvas surface this helper needs — kept framework-free so it is unit-testable. */
export interface ExportableCanvas {
  backgroundImage?: unknown;
  toDataURL: (opts?: object) => string;
  renderAll: () => void;
  requestRenderAll?: () => void;
}

export interface ExportPngOptions {
  format?: string;
  quality?: number;
  multiplier?: number;
}

function render(c: ExportableCanvas): void {
  if (typeof c.requestRenderAll === "function") c.requestRenderAll();
  else c.renderAll();
}

/**
 * PNG data URL of the canvas WITHOUT the underlay background. If no underlay is
 * set, this is a plain `toDataURL`. The background is always restored, even if
 * `toDataURL` throws.
 */
export function exportSketchPng(
  canvas: ExportableCanvas,
  opts?: ExportPngOptions,
): string {
  const saved = canvas.backgroundImage;
  const hadBackground = saved != null;
  if (!hadBackground) return canvas.toDataURL(opts);

  try {
    canvas.backgroundImage = null;
    render(canvas);
    return canvas.toDataURL(opts);
  } finally {
    canvas.backgroundImage = saved;
    render(canvas);
  }
}
