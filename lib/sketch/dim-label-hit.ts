/**
 * Hit-test helpers for on-canvas dimension labels (Fabric target can miss
 * when a room polygon sits above a non-selectable dim Text).
 */

export interface DimLabelHitCandidate {
  left: number;
  top: number;
  data?: {
    type?: string;
    dimFor?: string;
    edgeIndex?: number;
    metres?: number;
    editing?: boolean;
  };
  text?: string;
}

/**
 * Find the nearest dim-label whose centre is within `hitRadiusPx` of `p`.
 * Skips in-progress editors (`editing: true`).
 */
export function findNearestDimLabel(
  p: { x: number; y: number },
  labels: ReadonlyArray<DimLabelHitCandidate>,
  hitRadiusPx = 22,
): DimLabelHitCandidate | null {
  let best: DimLabelHitCandidate | null = null;
  let bestD = hitRadiusPx;
  for (const lbl of labels) {
    if (lbl.data?.type !== "dim-label") continue;
    if (lbl.data.editing === true) continue;
    if (typeof lbl.data.dimFor !== "string") continue;
    const d = Math.hypot((lbl.left ?? 0) - p.x, (lbl.top ?? 0) - p.y);
    if (d <= bestD) {
      bestD = d;
      best = lbl;
    }
  }
  return best;
}
