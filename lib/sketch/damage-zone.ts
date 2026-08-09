/**
 * Structured damage zones on the sketch canvas.
 * Freehand/brush paths stamp data.type = "damage" + damageKind for export/legend.
 * When the stroke lands inside a room polygon, fills are clipped to that room
 * so report markup follows walls (Encircle-style) instead of floating blobs.
 */

import { pointInPolygon, centroid } from "@/lib/sketch/geometry-utils";
import { polygonAbsolutePoints } from "@/lib/sketch/fabric-absolute";

export const DAMAGE_KINDS = [
  "water",
  "fire",
  "mould",
  "smoke",
  "biohazard",
  "structural",
  "electrical",
  "contents",
] as const;

export type DamageKind = (typeof DAMAGE_KINDS)[number];

export const DAMAGE_KIND_STYLES: Record<
  DamageKind,
  { stroke: string; fill: string; label: string }
> = {
  water: {
    stroke: "rgba(37, 99, 235, 0.85)",
    fill: "rgba(37, 99, 235, 0.22)",
    label: "Water",
  },
  fire: {
    stroke: "rgba(220, 38, 38, 0.85)",
    fill: "rgba(220, 38, 38, 0.22)",
    label: "Fire",
  },
  mould: {
    stroke: "rgba(22, 163, 74, 0.85)",
    fill: "rgba(22, 163, 74, 0.22)",
    label: "Mould",
  },
  smoke: {
    stroke: "rgba(75, 85, 99, 0.85)",
    fill: "rgba(75, 85, 99, 0.28)",
    label: "Smoke",
  },
  biohazard: {
    stroke: "rgba(202, 138, 4, 0.9)",
    fill: "rgba(202, 138, 4, 0.25)",
    label: "Biohazard",
  },
  structural: {
    stroke: "rgba(124, 58, 237, 0.85)",
    fill: "rgba(124, 58, 237, 0.22)",
    label: "Structural",
  },
  electrical: {
    stroke: "rgba(234, 179, 8, 0.9)",
    fill: "rgba(234, 179, 8, 0.25)",
    label: "Electrical",
  },
  contents: {
    stroke: "rgba(14, 165, 233, 0.85)",
    fill: "rgba(14, 165, 233, 0.2)",
    label: "Contents",
  },
};

export function isDamageKind(v: unknown): v is DamageKind {
  return typeof v === "string" && (DAMAGE_KINDS as readonly string[]).includes(v);
}

export interface RoomClipCandidate {
  id: string;
  points: ReadonlyArray<{ x: number; y: number }>;
  label?: string;
}

/**
 * Pick the smallest-area room whose polygon contains the point. Nested /
 * overlapping rooms prefer the tightest enclosure so damage binds to the
 * interior room rather than a whole-floor footprint.
 */
export function findContainingRoom(
  x: number,
  y: number,
  rooms: ReadonlyArray<RoomClipCandidate>,
): RoomClipCandidate | null {
  let best: RoomClipCandidate | null = null;
  let bestArea = Infinity;
  for (const room of rooms) {
    if (room.points.length < 3) continue;
    if (!pointInPolygon(x, y, room.points)) continue;
    // Shoelace without importing the full helper again — area for ranking only.
    let area = 0;
    const n = room.points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += room.points[i].x * room.points[j].y;
      area -= room.points[j].x * room.points[i].y;
    }
    area = Math.abs(area / 2);
    if (area > 0 && area < bestArea) {
      bestArea = area;
      best = room;
    }
  }
  return best;
}

/** Scene-space centre of a Fabric path / object for room hit-testing. */
export function damageAnchorPoint(obj: {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  getCenterPoint?: () => { x: number; y: number };
}): { x: number; y: number } {
  if (typeof obj.getCenterPoint === "function") {
    const c = obj.getCenterPoint();
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return c;
  }
  const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
  return {
    x: (obj.left ?? 0) + w / 2,
    y: (obj.top ?? 0) + h / 2,
  };
}

/**
 * Build room clip candidates from live Fabric objects (type === "room").
 */
export function roomsFromFabricObjects(
  objects: ReadonlyArray<unknown>,
): RoomClipCandidate[] {
  const out: RoomClipCandidate[] = [];
  for (const o of objects) {
    const data = (o as { data?: Record<string, unknown> }).data;
    if (!data || data.type !== "room") continue;
    const pts = polygonAbsolutePoints(o);
    if (!pts || pts.length < 3) continue;
    const id =
      typeof data.id === "string"
        ? data.id
        : `room-${Math.round(centroid(pts).x)}-${Math.round(centroid(pts).y)}`;
    out.push({
      id,
      points: pts,
      label: typeof data.label === "string" ? data.label : undefined,
    });
  }
  return out;
}

export interface DamageLegendEntry {
  kind: DamageKind;
  label: string;
  /** Hex-ish stroke for PDF swatches (opaque). */
  swatch: string;
}

const SWATCH_HEX: Record<DamageKind, string> = {
  water: "#2563EB",
  fire: "#DC2626",
  mould: "#16A34A",
  smoke: "#4B5563",
  biohazard: "#CA8A04",
  structural: "#7C3AED",
  electrical: "#EAB308",
  contents: "#0EA5E9",
};

/**
 * Unique damage kinds present in a Fabric JSON blob, in DAMAGE_KINDS order.
 * Used for the PDF damage legend beside the room legend.
 */
export function extractDamageLegend(
  fabricJson: Record<string, unknown> | null | undefined,
): DamageLegendEntry[] {
  const objects = fabricJson?.objects;
  if (!Array.isArray(objects)) return [];
  const seen = new Set<DamageKind>();
  for (const o of objects) {
    const data = (o as { data?: { type?: string; damageKind?: unknown } })?.data;
    if (data?.type !== "damage") continue;
    if (isDamageKind(data.damageKind)) seen.add(data.damageKind);
  }
  return DAMAGE_KINDS.filter((k) => seen.has(k)).map((kind) => ({
    kind,
    label: DAMAGE_KIND_STYLES[kind].label,
    swatch: SWATCH_HEX[kind],
  }));
}

/**
 * Descriptor for a room-shaped clipPath. The canvas materialises this into a
 * Fabric.Polygon with `absolutePositioned: true` so the fill follows walls in
 * scene coordinates regardless of path local origin.
 */
export interface RoomClipPathDescriptor {
  points: Array<{ x: number; y: number }>;
  roomId: string;
  absolutePositioned: true;
}

export function roomClipPathDescriptor(
  room: RoomClipCandidate,
): RoomClipPathDescriptor {
  return {
    points: room.points.map((p) => ({ x: p.x, y: p.y })),
    roomId: room.id,
    absolutePositioned: true,
  };
}
