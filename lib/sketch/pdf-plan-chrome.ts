/**
 * Report-page chrome for floor-plan PDFs: north arrow + graphic scale bar.
 * Pure geometry / layout helpers — pdf-lib drawing stays in generate-sketch-pdf.
 */

export interface NorthArrowGeometry {
  /** Tip of the north arrow (canvas/PDF y-up for pdf-lib). */
  tip: { x: number; y: number };
  baseLeft: { x: number; y: number };
  baseRight: { x: number; y: number };
  /** Stem end below the tip. */
  stemEnd: { x: number; y: number };
  label: { x: number; y: number; text: "N" };
}

/**
 * Compact north arrow pointing up from `origin` (bottom-centre of the mark).
 * `size` is overall height in PDF points.
 */
export function northArrowGeometry(
  origin: { x: number; y: number },
  size = 22,
): NorthArrowGeometry {
  const tip = { x: origin.x, y: origin.y + size };
  const baseY = origin.y + size * 0.35;
  const half = size * 0.28;
  return {
    tip,
    baseLeft: { x: origin.x - half, y: baseY },
    baseRight: { x: origin.x + half, y: baseY },
    stemEnd: { x: origin.x, y: origin.y },
    label: { x: origin.x, y: tip.y + 8, text: "N" },
  };
}

export interface ScaleBarLayout {
  /** Length of the bar in PDF points. */
  barLengthPt: number;
  /** Real-world metres the bar represents. */
  metres: number;
  /** Tick positions as fractions along the bar [0..1]. */
  ticks: number[];
  label: string;
}

/**
 * Pick a clean scale-bar length (1 / 2 / 5 × 10^n metres) that fits in
 * `maxWidthPt` given how many PDF points map to one metre on the drawn image.
 */
export function scaleBarLayout(
  pxPerMetre: number,
  imageDrawWidthPt: number,
  imageWidthPx: number,
  maxWidthPt = 120,
): ScaleBarLayout | null {
  if (
    !(pxPerMetre > 0) ||
    !(imageDrawWidthPt > 0) ||
    !(imageWidthPx > 0) ||
    !(maxWidthPt > 0)
  ) {
    return null;
  }
  // PDF points per real metre on the placed image.
  const ptPerMetre = (imageDrawWidthPt / imageWidthPx) * pxPerMetre;
  if (!(ptPerMetre > 0)) return null;

  const candidates = [0.5, 1, 2, 5, 10, 20, 50];
  let metres = 1;
  for (const m of candidates) {
    if (m * ptPerMetre <= maxWidthPt) metres = m;
    else break;
  }
  // If even 0.5 m is too wide, shrink to what fits.
  if (0.5 * ptPerMetre > maxWidthPt) {
    metres = Math.max(0.25, maxWidthPt / ptPerMetre);
  }
  const barLengthPt = metres * ptPerMetre;
  const label =
    metres >= 1
      ? `${Number.isInteger(metres) ? metres.toFixed(0) : metres.toFixed(1)} m`
      : `${metres.toFixed(2)} m`;
  return {
    barLengthPt,
    metres,
    ticks: [0, 0.5, 1],
    label,
  };
}
