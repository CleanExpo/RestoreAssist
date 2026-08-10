/**
 * Equipment placement snap — prefer room interiors and near-wall offsets so
 * drying gear lands where techs expect (not floating in corridor void).
 */

import { pointInPolygon } from "./geometry-utils";
import {
  projectPointOntoSegment,
  type Point,
  type WallSegment,
} from "./opening-geometry";

export interface RoomPoly {
  id: string;
  points: ReadonlyArray<Point>;
}

export interface EquipmentSnapResult {
  x: number;
  y: number;
  /** Where the click resolved. */
  snappedTo: "interior" | "near_wall" | "none";
  roomId: string | null;
}

/** Pull equipment this far inside from a wall when near-wall snapping (metres). */
export const EQUIPMENT_WALL_INSET_M = 0.35;

/** Prefer near-wall snap when click is within this distance of a wall (metres). */
export const EQUIPMENT_NEAR_WALL_M = 0.6;

function polyCentroid(pts: ReadonlyArray<Point>): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
}

/**
 * Snap equipment placement:
 * 1. If inside a room and near a wall → inset from that wall toward interior.
 * 2. If inside a room → keep point (interior).
 * 3. If outside but near a room wall → snap into that room near the wall.
 * 4. Else unchanged.
 */
export function snapEquipmentPlacement(
  p: Point,
  rooms: ReadonlyArray<RoomPoly>,
  pxPerMetre: number,
  opts?: {
    nearWallM?: number;
    insetM?: number;
  },
): EquipmentSnapResult {
  const scale = pxPerMetre > 0 ? pxPerMetre : 100;
  const nearPx = (opts?.nearWallM ?? EQUIPMENT_NEAR_WALL_M) * scale;
  const insetPx = (opts?.insetM ?? EQUIPMENT_WALL_INSET_M) * scale;

  let containing: RoomPoly | null = null;
  for (const r of rooms) {
    if (r.points.length >= 3 && pointInPolygon(p.x, p.y, r.points)) {
      containing = r;
      break;
    }
  }

  const wallsFor = (room: RoomPoly): WallSegment[] => {
    const segs: WallSegment[] = [];
    const pts = room.points;
    for (let i = 0; i < pts.length; i++) {
      segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
    }
    return segs;
  };

  const nearWallInset = (
    room: RoomPoly,
    point: Point,
  ): { x: number; y: number } | null => {
    const walls = wallsFor(room);
    let bestDist = Infinity;
    let best: { anchor: Point; seg: WallSegment } | null = null;
    for (const seg of walls) {
      const anchor = projectPointOntoSegment(point, seg);
      const d = Math.hypot(anchor.x - point.x, anchor.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = { anchor, seg };
      }
    }
    if (!best || bestDist > nearPx) return null;
    const c = polyCentroid(room.points);
    const vx = c.x - best.anchor.x;
    const vy = c.y - best.anchor.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-6) return { x: best.anchor.x, y: best.anchor.y };
    const ux = vx / len;
    const uy = vy / len;
    return {
      x: best.anchor.x + ux * insetPx,
      y: best.anchor.y + uy * insetPx,
    };
  };

  if (containing) {
    const inset = nearWallInset(containing, p);
    if (inset) {
      return {
        x: inset.x,
        y: inset.y,
        snappedTo: "near_wall",
        roomId: containing.id,
      };
    }
    return {
      x: p.x,
      y: p.y,
      snappedTo: "interior",
      roomId: containing.id,
    };
  }

  // Outside: try to pull into nearest room if close to a wall.
  let bestOutside: {
    room: RoomPoly;
    pt: Point;
    dist: number;
  } | null = null;
  for (const room of rooms) {
    if (room.points.length < 3) continue;
    const inset = nearWallInset(room, p);
    if (!inset) continue;
    const d = Math.hypot(inset.x - p.x, inset.y - p.y);
    if (!bestOutside || d < bestOutside.dist) {
      bestOutside = { room, pt: inset, dist: d };
    }
  }
  if (bestOutside && bestOutside.dist <= nearPx * 1.5) {
    return {
      x: bestOutside.pt.x,
      y: bestOutside.pt.y,
      snappedTo: "near_wall",
      roomId: bestOutside.room.id,
    };
  }

  return { x: p.x, y: p.y, snappedTo: "none", roomId: null };
}
