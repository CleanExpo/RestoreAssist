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
 * RA-6844 [A5] — snap a single drawn point to the grid on both axes.
 * `gridPx <= 0` is a no-op (snap disabled).
 */
export function snapPointToGrid(
  p: { x: number; y: number },
  gridPx: number,
): { x: number; y: number } {
  if (!(gridPx > 0)) return p;
  return { x: snapToGrid(p.x, gridPx), y: snapToGrid(p.y, gridPx) };
}

/**
 * RA-6844 [A5] — right-angle assist for drag tools (wall / measure / arrow).
 * Locks the segment onto the nearest `angleStepDeg` ray from `start` (so walls
 * square up), then grid-snaps the resulting endpoint. Preserving the drawn
 * length before the axis grid-snap keeps near-orthogonal drags reading as
 * clean horizontals/verticals. `gridPx <= 0` skips the grid step; passing the
 * raw end with a full step (e.g. 360) skips the angle lock.
 */
export function snapSegmentEnd(
  start: { x: number; y: number },
  end: { x: number; y: number },
  gridPx: number,
  angleStepDeg = 45,
): { x: number; y: number } {
  let ex = end.x;
  let ey = end.y;
  if (angleStepDeg > 0 && angleStepDeg < 360) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const snappedDeg = snapAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI, angleStepDeg);
      const rad = (snappedDeg * Math.PI) / 180;
      ex = start.x + dist * Math.cos(rad);
      ey = start.y + dist * Math.sin(rad);
    }
  }
  return snapPointToGrid({ x: ex, y: ey }, gridPx);
}

/**
 * Format a pixel distance as a human-readable measurement string.
 * e.g. 250px @ 100px/m → "2.50 m"
 */
export function formatMetres(px: number, pxPerMetre = 100): string {
  return `${(px / pxPerMetre).toFixed(2)} m`;
}

// ─── RA-6842 [A3] — Auto dimension strings ─────────────────────────────────

/**
 * Format a pixel distance as a dimension string honouring unit preference.
 * Codebase is metric-only; this function is the single extension point if
 * imperial is added later. Currently always returns metres at 2 d.p.
 *
 * @param px          Pixel distance on the canvas
 * @param pxPerMetre  Canvas pixels per real-world metre (default 100)
 * @param useImperial Reserved for future imperial support (no-op today)
 */
export function formatDimension(
  px: number,
  pxPerMetre = 100,
  useImperial = false,
): string {
  if (useImperial) {
    // 1 metre = 3.28084 feet; display as X'-Y" (e.g. 4'-8")
    const totalFeet = (px / pxPerMetre) * 3.28084;
    const feet = Math.floor(totalFeet);
    const inches = Math.round((totalFeet - feet) * 12);
    return `${feet}'-${inches}"`;
  }
  return `${(px / pxPerMetre).toFixed(2)} m`;
}

/**
 * Midpoint of a segment and the perpendicular label offset position.
 *
 * Returns `{ mid, labelPos }` where `labelPos` is shifted `offsetPx` pixels
 * to the left of the segment direction (i.e. outside a clockwise-wound room).
 * Pass a negative `offsetPx` to flip to the right side.
 *
 * @param a         Segment start (canvas coordinates)
 * @param b         Segment end   (canvas coordinates)
 * @param offsetPx  Perpendicular offset distance in pixels (default 20)
 */
export function segmentLabelPosition(
  a: { x: number; y: number },
  b: { x: number; y: number },
  offsetPx = 20,
): { mid: { x: number; y: number }; labelPos: { x: number; y: number } } {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { mid, labelPos: mid };
  // Perpendicular: rotate 90° counter-clockwise (left of the forward direction)
  const perpX = -dy / len;
  const perpY = dx / len;
  return {
    mid,
    labelPos: {
      x: mid.x + perpX * offsetPx,
      y: mid.y + perpY * offsetPx,
    },
  };
}

/**
 * Axis-aligned bounding box of a set of points, plus the tick-mark endpoints
 * for overall footprint dimension strings rendered outside the plan.
 *
 * Tick geometry:
 *   - Top edge: horizontal dimension above the plan, `margin` px above minY
 *   - Left edge: vertical dimension left of the plan, `margin` px left of minX
 *
 * Each tick is a pair of points: `[lineStart, lineEnd]` spanning the full
 * width/height of the bounding box at the given margin.
 *
 * @param points  All canvas points in the plan
 * @param margin  Gap between the plan boundary and the dimension line (default 30)
 */
export function footprintDimensions(
  points: ReadonlyArray<{ x: number; y: number }>,
  margin = 30,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthPx: number;
  heightPx: number;
  /** Top horizontal dimension line: [{x,y}, {x,y}] */
  topTick: [{ x: number; y: number }, { x: number; y: number }];
  /** Left vertical dimension line: [{x,y}, {x,y}] */
  leftTick: [{ x: number; y: number }, { x: number; y: number }];
  /** Label position for the width dimension */
  widthLabelPos: { x: number; y: number };
  /** Label position for the height dimension */
  heightLabelPos: { x: number; y: number };
} {
  if (points.length === 0) {
    return {
      minX: 0, minY: 0, maxX: 0, maxY: 0,
      widthPx: 0, heightPx: 0,
      topTick: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      leftTick: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      widthLabelPos: { x: 0, y: 0 },
      heightLabelPos: { x: 0, y: 0 },
    };
  }
  let minX = points[0].x, minY = points[0].y;
  let maxX = points[0].x, maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const widthPx = maxX - minX;
  const heightPx = maxY - minY;
  const dimY = minY - margin;
  const dimX = minX - margin;
  return {
    minX, minY, maxX, maxY,
    widthPx, heightPx,
    topTick: [{ x: minX, y: dimY }, { x: maxX, y: dimY }],
    leftTick: [{ x: dimX, y: minY }, { x: dimX, y: maxY }],
    widthLabelPos: { x: (minX + maxX) / 2, y: dimY - 12 },
    heightLabelPos: { x: dimX - 12, y: (minY + maxY) / 2 },
  };
}
