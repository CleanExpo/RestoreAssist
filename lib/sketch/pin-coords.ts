/**
 * RA-6763 — stable moisture-pin coordinates.
 *
 * Pins were stored as absolute canvas pixels (`x`,`y`), so they drifted whenever
 * the canvas was zoomed, panned, or responsively resized. We now also store
 * normalized fractions (`nx`,`ny` in 0..1 of the canvas) and render from those,
 * which stay anchored to the same point regardless of the rendered size.
 *
 * Backward-compatible: legacy pins without `nx`/`ny` fall back to their absolute
 * `x`/`y`, so already-saved sketches keep rendering correctly.
 */

export interface PinCoords {
  x: number;
  y: number;
  nx?: number | null;
  ny?: number | null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Convert absolute canvas pixels to normalized 0..1 fractions. */
export function toNormalized(
  x: number,
  y: number,
  width: number,
  height: number,
): { nx: number; ny: number } {
  return {
    nx: clamp01(x / (width || 1)),
    ny: clamp01(y / (height || 1)),
  };
}

/**
 * Pixel position to render a pin at, for the current canvas size. Prefers the
 * normalized fraction (stable under resize/zoom); falls back to the legacy
 * absolute coordinate for pins saved before RA-6763.
 */
export function pinPixelPosition(
  pin: PinCoords,
  width: number,
  height: number,
): { left: number; top: number } {
  if (typeof pin.nx === "number" && typeof pin.ny === "number") {
    return { left: pin.nx * width, top: pin.ny * height };
  }
  return { left: pin.x, top: pin.y };
}
