/**
 * moisture-map.ts — RA-120 (acceptance criterion 3): render the moisture map
 * into the report PDF alongside the structural sketch.
 *
 * The moisture pins live in `ClaimSketch.moisturePoints` as a client DOM overlay
 * (see components/sketch/SketchMoistureLayer). That overlay is React nodes, not
 * Fabric objects, so it is NOT baked into the rasterised `renderedPngUrl` the
 * report embeds — the moisture map never reached the PDF. These pure helpers
 * turn the persisted overlay into typed pins the PDF generator overlays on the
 * same page as the structural sketch, so both are "included" per the ticket.
 *
 * IICRC S500:2021 §8.1 moisture class + colour is the single source of truth
 * (lib/sketch/iicrc-utils), so the PDF map is faithful to the on-screen overlay.
 */

import {
  deriveIicrClass,
  getClassInfo,
  type IicrClass,
  type IicrClassInfo,
} from "@/lib/sketch/iicrc-utils";

/** A moisture pin ready to draw on the sketch page. */
export interface MoistureMapPin {
  /** Normalized 0..1 position across the sketch image (RA-6763). */
  nx: number;
  ny: number;
  /** Wood-moisture-equivalent % reading. */
  wme: number;
  /** IICRC S500:2021 §8.1 class, recomputed from `wme` for integrity. */
  iicrClass: IicrClass;
  /** Hex colour for the class (from the IICRC SSOT). */
  color: string;
}

/**
 * Parse the persisted `ClaimSketch.moisturePoints` JSON into typed map pins.
 *
 * Only pins carrying a numeric `wme` AND a normalized `nx`/`ny` in 0..1 are
 * kept — those are the ones whose position is stable and mappable onto the
 * rasterised sketch (legacy pre-RA-6763 pins stored only absolute canvas
 * pixels, which can't be placed without the original canvas size, so they are
 * skipped rather than mis-placed). The IICRC class is recomputed from `wme`
 * (never trusted from the stored blob) so the map's colour can't drift from the
 * reading it represents.
 */
export function parseMoisturePins(raw: unknown): MoistureMapPin[] {
  if (!Array.isArray(raw)) return [];
  const pins: MoistureMapPin[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    const wme = rec.wme;
    const nx = rec.nx;
    const ny = rec.ny;
    if (typeof wme !== "number" || Number.isNaN(wme)) continue;
    if (typeof nx !== "number" || nx < 0 || nx > 1) continue;
    if (typeof ny !== "number" || ny < 0 || ny > 1) continue;
    const iicrClass = deriveIicrClass(wme);
    pins.push({ nx, ny, wme, iicrClass, color: getClassInfo(iicrClass).color });
  }
  return pins;
}

/** A pin resolved to absolute page coordinates + its render attributes. */
export interface PinPlacement {
  cx: number;
  cy: number;
  wme: number;
  color: string;
}

/**
 * Place normalized pins onto the drawn sketch image. `img` is the image's
 * rectangle in pdf-lib page space (origin bottom-left). `ny` is top-down (DOM
 * convention) so it is flipped to match the page's bottom-up Y axis, keeping
 * the map spatially faithful to the on-screen overlay.
 */
export function placeMoisturePins(
  pins: MoistureMapPin[],
  img: { x: number; y: number; width: number; height: number },
): PinPlacement[] {
  return pins.map((p) => ({
    cx: img.x + p.nx * img.width,
    cy: img.y + (1 - p.ny) * img.height,
    wme: p.wme,
    color: p.color,
  }));
}

/**
 * Distinct IICRC classes present among the pins, ordered 1→4 — drives the
 * moisture legend so a reader can interpret the pin colours.
 */
export function moistureLegendClasses(pins: MoistureMapPin[]): IicrClassInfo[] {
  const present = new Set(pins.map((p) => p.iicrClass));
  return ([1, 2, 3, 4] as IicrClass[])
    .filter((c) => present.has(c))
    .map((c) => getClassInfo(c));
}
