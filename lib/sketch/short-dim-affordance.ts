/**
 * Short-edge dimension affordances — when edge dims are hidden (&lt; 0.45 m),
 * offer a Measure-tool CTA so techs can still annotate the stub.
 */

import {
  MIN_EDGE_DIM_M,
  segmentLabelPosition,
  shouldShowEdgeDimension,
} from "./geometry-utils";

export interface Point {
  x: number;
  y: number;
}

export interface ShortDimAffordance {
  edgeIndex: number;
  a: Point;
  b: Point;
  mid: Point;
  labelPos: Point;
  metres: number;
  /** Button / hit label. */
  label: string;
}

export const SHORT_DIM_CTA_TYPE = "short-dim-cta" as const;
export const SHORT_DIM_CTA_LABEL = "+ meas";

/**
 * Edges that fail the short-dim rule, with a placement for a subtle CTA.
 */
export function shortEdgeMeasureAffordances(
  points: ReadonlyArray<Point>,
  pxPerMetre: number,
  minMetres = MIN_EDGE_DIM_M,
): ShortDimAffordance[] {
  const scale = pxPerMetre > 0 ? pxPerMetre : 100;
  const out: ShortDimAffordance[] = [];
  if (points.length < 2) return out;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (shouldShowEdgeDimension(px, scale, minMetres)) continue;
    if (!(px > 1)) continue;
    const { mid, labelPos } = segmentLabelPosition(a, b, 14);
    out.push({
      edgeIndex: i,
      a: { ...a },
      b: { ...b },
      mid,
      labelPos,
      metres: px / scale,
      label: SHORT_DIM_CTA_LABEL,
    });
  }
  return out;
}

/**
 * Hit-test a short-dim CTA (scene coords). Returns index into `affordances`
 * or -1.
 */
export function hitTestShortDimAffordance(
  p: Point,
  affordances: ReadonlyArray<Pick<ShortDimAffordance, "labelPos">>,
  hitRadiusPx = 16,
): number {
  let best = -1;
  let bestD = hitRadiusPx;
  for (let i = 0; i < affordances.length; i++) {
    const q = affordances[i].labelPos;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
