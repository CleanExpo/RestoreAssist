/**
 * Dual-write bridge (spec §6.4, T1.2).
 *
 * Decomposes the authoritative Fabric.js canvas blob (`ClaimSketch.sketchData`)
 * into normalized `SketchElement` inputs on save. The blob stays the rendering
 * source of truth; these derived rows are what compliance/scope/export query.
 *
 * In Phase 1 there is no underlay import, so every element is `operator_measured`
 * (spec §6.4). The caller may override provenance for underlay-derived geometry.
 */

const DEFAULT_PX_PER_M = 100; // canvas default: 100px = 1m

const CANONICAL_TYPES = new Set([
  "wall",
  "opening",
  "room",
  "fixture",
  "damage",
]);

export type Provenance = "operator_measured" | "underlay_reference";

type Point = { x: number; y: number } | [number, number];

interface FabricObject {
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  points?: Point[];
  data?: {
    type?: string;
    material?: string;
    provenance?: Provenance;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface SketchData {
  objects?: FabricObject[];
  scaleConfig?: { pxPerMetre?: number };
  [k: string]: unknown;
}

export interface DimensionsM {
  widthM?: number;
  heightM?: number;
  areaM2?: number;
}

export interface DecomposedElement {
  type: "wall" | "opening" | "room" | "fixture" | "damage";
  geometryJson: FabricObject;
  dimensionsM: DimensionsM | null;
  materialSlug: string | null;
  provenance: Provenance;
}

export interface DecomposeOptions {
  /** Override the sketch scale (px per metre). */
  pxPerMetre?: number;
  /** Override provenance for all produced elements (e.g. underlay import). */
  provenance?: Provenance;
}

function xy(p: Point): { x: number; y: number } {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

/** Polygon area in px² via the shoelace formula. */
function shoelacePx(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = xy(points[i]);
    const b = xy(points[(i + 1) % points.length]);
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function dimensions(obj: FabricObject, pxPerM: number): DimensionsM | null {
  if (Array.isArray(obj.points) && obj.points.length >= 3) {
    return { areaM2: shoelacePx(obj.points) / (pxPerM * pxPerM) };
  }
  if (typeof obj.width === "number" && typeof obj.height === "number") {
    const widthM = obj.width / pxPerM;
    const heightM = obj.height / pxPerM;
    return { widthM, heightM, areaM2: widthM * heightM };
  }
  return null;
}

export function decomposeElements(
  sketchData: SketchData,
  opts: DecomposeOptions = {},
): DecomposedElement[] {
  const objects = sketchData?.objects ?? [];
  const pxPerM =
    opts.pxPerMetre ?? sketchData?.scaleConfig?.pxPerMetre ?? DEFAULT_PX_PER_M;

  const out: DecomposedElement[] = [];
  for (const obj of objects) {
    const t = obj.data?.type;
    if (!t || !CANONICAL_TYPES.has(t)) continue;
    out.push({
      type: t as DecomposedElement["type"],
      geometryJson: obj,
      dimensionsM: dimensions(obj, pxPerM),
      materialSlug: obj.data?.material ?? null,
      provenance:
        opts.provenance ?? obj.data?.provenance ?? "operator_measured",
    });
  }
  return out;
}
