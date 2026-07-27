/**
 * RA-7091 — convert RoomPlan walls / doors / windows into Fabric descriptors.
 *
 * Native Swift already emits these surfaces; earlier phases only landed floor
 * polygons. This module projects wall bottom-edges and opening centres into
 * the same PX_PER_METRE space as rooms so the canvas matches the LiDAR scan.
 */
import { PX_PER_METRE } from "./extract-rooms";
import {
  metresToPx,
  WALL_THICKNESS_INTERNAL_M,
} from "./tool-objects";
import type { RoomPlanPoint } from "./roomplan-to-fabric";

export interface CapturedSurface {
  category?: string;
  identifier?: string;
  dimensions?: { x?: number; y?: number; z?: number };
  /** World-space polygon corners (metres); often 4 for a wall rectangle. */
  polygon?: RoomPlanPoint[];
}

function depthOf(p: RoomPlanPoint): number {
  return p.z ?? p.y ?? 0;
}

function toPx(p: RoomPlanPoint): { x: number; y: number } {
  return { x: p.x * PX_PER_METRE, y: depthOf(p) * PX_PER_METRE };
}

/** Bottom edge of a wall polygon → canvas line endpoints. */
export function wallSegmentFromPolygon(
  polygon: RoomPlanPoint[] | undefined,
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  if (!polygon || polygon.length < 2) return null;
  // Prefer the two lowest-elevation corners (world Y) as the floor edge.
  const ranked = [...polygon].sort(
    (p, q) => (p.y ?? 0) - (q.y ?? 0),
  );
  const a = toPx(ranked[0]);
  const b = toPx(ranked[1]);
  if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) return null;
  if (a.x === b.x && a.y === b.y) return null;
  return { a, b };
}

export interface FabricWallElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  data: {
    type: "wall";
    id: string;
    provenance: "underlay_reference";
    captureAdapter: "roomplan";
    lengthM: number;
  };
}

export interface FabricOpeningElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  data: {
    type: "opening";
    openingKind: "door" | "window" | "opening";
    id: string;
    provenance: "underlay_reference";
    captureAdapter: "roomplan";
    widthM: number;
  };
}

function newId(kind: string, index: number): string {
  return `roomplan-${kind}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function lengthM(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.round((Math.hypot(b.x - a.x, b.y - a.y) / PX_PER_METRE) * 100) / 100;
}

/** Convert RoomPlan wall surfaces into Fabric wall lines. */
export function roomPlanWallsToFabric(
  walls: CapturedSurface[] | null | undefined,
): FabricWallElement[] {
  if (!walls?.length) return [];
  const strokeWidth = metresToPx(WALL_THICKNESS_INTERNAL_M, PX_PER_METRE);
  const out: FabricWallElement[] = [];
  for (let i = 0; i < walls.length; i++) {
    const seg = wallSegmentFromPolygon(walls[i].polygon);
    if (!seg) continue;
    out.push({
      type: "line",
      x1: seg.a.x,
      y1: seg.a.y,
      x2: seg.b.x,
      y2: seg.b.y,
      stroke: "#1C2E47",
      strokeWidth,
      data: {
        type: "wall",
        id: walls[i].identifier
          ? `roomplan-wall-${walls[i].identifier}`
          : newId("wall", i),
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        lengthM: lengthM(seg.a, seg.b),
      },
    });
  }
  return out;
}

/**
 * Convert door/window/opening surfaces into short cut lines along their
 * centre, sized from dimensions.x (metres) when present.
 */
export function roomPlanOpeningsToFabric(
  surfaces: CapturedSurface[] | null | undefined,
  openingKind: "door" | "window" | "opening",
): FabricOpeningElement[] {
  if (!surfaces?.length) return [];
  const out: FabricOpeningElement[] = [];
  for (let i = 0; i < surfaces.length; i++) {
    const poly = surfaces[i].polygon;
    if (!poly || poly.length < 2) continue;
    const pts = poly.map(toPx).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 2) continue;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    // Opening orientation: use the longest edge of the projected polygon.
    let bestA = pts[0];
    let bestB = pts[1];
    let bestLen = 0;
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const len = Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y);
        if (len > bestLen) {
          bestLen = len;
          bestA = pts[a];
          bestB = pts[b];
        }
      }
    }
    const dx = bestB.x - bestA.x;
    const dy = bestB.y - bestA.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const widthM =
      typeof surfaces[i].dimensions?.x === "number" &&
      Number.isFinite(surfaces[i].dimensions!.x!)
        ? Math.max(0.3, surfaces[i].dimensions!.x!)
        : Math.max(0.3, bestLen / PX_PER_METRE);
    const half = (widthM * PX_PER_METRE) / 2;
    const stroke =
      openingKind === "window"
        ? "#00BAD4"
        : openingKind === "door"
          ? "#D4A574"
          : "#94a3b8";
    out.push({
      type: "line",
      x1: cx - ux * half,
      y1: cy - uy * half,
      x2: cx + ux * half,
      y2: cy + uy * half,
      stroke,
      strokeWidth: 4,
      data: {
        type: "opening",
        openingKind,
        id: surfaces[i].identifier
          ? `roomplan-${openingKind}-${surfaces[i].identifier}`
          : newId(openingKind, i),
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        widthM: Math.round(widthM * 100) / 100,
      },
    });
  }
  return out;
}
