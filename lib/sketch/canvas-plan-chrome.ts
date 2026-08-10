/**
 * On-canvas plan chrome (north arrow + scale bar) for the live editor.
 * Matches report PDF chrome intent with RestoreAssist navy styling — not an
 * Encircle clone. Scene y-down (screen coords).
 */

import { scaleBarLayout } from "./pdf-plan-chrome";

export const PLAN_CHROME_TYPE = "plan-chrome" as const;

export interface CanvasNorthArrow {
  tip: { x: number; y: number };
  baseLeft: { x: number; y: number };
  baseRight: { x: number; y: number };
  stemEnd: { x: number; y: number };
  label: { x: number; y: number; text: "N" };
}

/** North arrow pointing up (decreasing y) from origin at the stem base. */
export function canvasNorthArrowGeometry(
  origin: { x: number; y: number },
  size = 28,
): CanvasNorthArrow {
  const tip = { x: origin.x, y: origin.y - size };
  const baseY = origin.y - size * 0.35;
  const half = size * 0.28;
  return {
    tip,
    baseLeft: { x: origin.x - half, y: baseY },
    baseRight: { x: origin.x + half, y: baseY },
    stemEnd: { x: origin.x, y: origin.y },
    label: { x: origin.x, y: tip.y - 10, text: "N" },
  };
}

export interface CanvasScaleBar {
  x: number;
  y: number;
  barLengthPx: number;
  metres: number;
  ticks: number[];
  label: string;
}

export interface PlanChromeLayout {
  north: CanvasNorthArrow;
  scale: CanvasScaleBar | null;
}

/**
 * Place discreet chrome in the top-right (N) and bottom-right (scale) of the
 * visible scene rect. `scene` is content or viewport AABB in scene pixels.
 */
export function layoutCanvasPlanChrome(input: {
  sceneLeft: number;
  sceneTop: number;
  sceneWidth: number;
  sceneHeight: number;
  pxPerMetre: number;
  marginPx?: number;
}): PlanChromeLayout {
  const margin = input.marginPx ?? 28;
  const right = input.sceneLeft + input.sceneWidth - margin;
  const top = input.sceneTop + margin;
  const bottom = input.sceneTop + input.sceneHeight - margin;

  const north = canvasNorthArrowGeometry(
    { x: right - 8, y: top + 36 },
    26,
  );

  const layout = scaleBarLayout(
    input.pxPerMetre,
    Math.min(140, input.sceneWidth * 0.35),
    Math.min(140, input.sceneWidth * 0.35),
    140,
  );
  // scaleBarLayout uses ptPerMetre from image mapping; for canvas we want
  // bar length = metres * pxPerMetre directly.
  const candidates = [0.5, 1, 2, 5, 10, 20];
  const maxBar = Math.min(160, Math.max(40, input.sceneWidth * 0.28));
  let metres = 1;
  for (const m of candidates) {
    if (m * input.pxPerMetre <= maxBar) metres = m;
    else break;
  }
  if (0.5 * input.pxPerMetre > maxBar) {
    metres = Math.max(0.25, maxBar / input.pxPerMetre);
  }
  const barLengthPx = metres * input.pxPerMetre;
  const label =
    metres >= 1
      ? `${Number.isInteger(metres) ? metres.toFixed(0) : metres.toFixed(1)} m`
      : `${metres.toFixed(2)} m`;

  const scale: CanvasScaleBar = {
    x: right - barLengthPx,
    y: bottom - 8,
    barLengthPx,
    metres,
    ticks: layout?.ticks ?? [0, 0.5, 1],
    label,
  };

  return { north, scale };
}
