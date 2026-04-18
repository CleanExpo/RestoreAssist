/**
 * geometry-utils.ts — shared geometry helpers for the sketch tool
 *
 * Extracted from lib/sketch-estimate-extractor.ts and lib/generate-sketch-pdf.ts
 * so they can share a single source of truth.
 */

/** Signed area via the shoelace formula — returns pixels² */
export function shoelaceAreaPx2(
  points: ReadonlyArray<{ x: number; y: number }>,
): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Convert pixel² area to m² using the current scale config.
 * @param px2       Area in canvas pixels²
 * @param pxPerMetre  Canvas pixels per real-world metre (default 100)
 */
export function px2ToM2(px2: number, pxPerMetre = 100): number {
  return px2 / (pxPerMetre * pxPerMetre);
}

/** Centroid of a polygon (for label placement) */
export function centroid(points: ReadonlyArray<{ x: number; y: number }>): {
  x: number;
  y: number;
} {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

/**
 * Snap a value to the nearest multiple of `grid`.
 * Used for grid snapping during shape drawing.
 */
export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

/**
 * Distance between two points.
 */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Snap an angle to the nearest multiple of `snap` degrees (default 45°).
 */
export function snapAngleDeg(angleDeg: number, snap = 45): number {
  return Math.round(angleDeg / snap) * snap;
}

/**
 * Format a pixel distance as a human-readable measurement string.
 * e.g. 250px @ 100px/m → "2.50 m"
 */
export function formatMetres(px: number, pxPerMetre = 100): string {
  return `${(px / pxPerMetre).toFixed(2)} m`;
}
