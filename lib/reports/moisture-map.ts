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
  /** Scene position, the same units the plan's geometry is drawn in. */
  x: number;
  y: number;
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
 * Only pins carrying a numeric `wme` AND a scene `x`/`y` are kept. The saved
 * `nx`/`ny` are fractions of whatever panel the technician had open, not of the
 * plan, so they are never used for placement. The IICRC class is recomputed from
 * `wme` (never trusted from the stored blob) so the map's colour can't drift from
 * the reading it represents.
 */
export function parseMoisturePins(raw: unknown): MoistureMapPin[] {
  if (!Array.isArray(raw)) return [];
  const pins: MoistureMapPin[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    const wme = rec.wme;
    const x = rec.x;
    const y = rec.y;
    if (typeof wme !== "number" || Number.isNaN(wme)) continue;
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    if (typeof y !== "number" || !Number.isFinite(y)) continue;
    const iicrClass = deriveIicrClass(wme);
    pins.push({ x, y, wme, iicrClass, color: getClassInfo(iicrClass).color });
  }
  return pins;
}

/** Saved readings that have a value but no scene position to print them at. */
export function countUnplaceableMoisturePins(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  const withValue = raw.filter((p) => {
    const wme = (p as { wme?: unknown } | null)?.wme;
    return typeof wme === "number" && !Number.isNaN(wme);
  });
  return withValue.length - parseMoisturePins(raw).length;
}

/** A pin resolved to absolute page coordinates + its render attributes. */
export interface PinPlacement {
  cx: number;
  cy: number;
  wme: number;
  color: string;
}

/**
 * Place pins onto the drawn sketch image. `img` is the image's rectangle in
 * pdf-lib page space (origin bottom-left); `frame` is the embedded PNG's pixel
 * size, one pixel to one scene unit on a clean render. Y is top-down in the
 * scene and flipped for the page. A pin outside the frame has no true position
 * on this image, so it is left out and the caller counts it as not shown.
 */
export function placeMoisturePins(
  pins: MoistureMapPin[],
  img: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number },
): PinPlacement[] {
  return pins
    .filter(
      (p) => p.x >= 0 && p.y >= 0 && p.x <= frame.width && p.y <= frame.height,
    )
    .map((p) => ({
      cx: img.x + (p.x / frame.width) * img.width,
      cy: img.y + (1 - p.y / frame.height) * img.height,
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
