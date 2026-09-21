/**
 * Shared room-area extraction from the Fabric.js blob.
 *
 * Single source of truth used by BOTH the PDF generator (generate-sketch-pdf)
 * and the structured scope export (lib/export/scope-contract) so the human PDF
 * and the machine-readable export can never drift.
 */

import {
  DEFAULT_PX_PER_METRE,
  isMeasuredRoom,
  resolvePxPerMetre,
  resolveRoomAreaM2,
  roomLabel,
  type RoomGeometryObject,
} from "./room-area-from-geometry";

/** Canvas scale: 100 pixels = 1 metre. */
export const PX_PER_METRE = DEFAULT_PX_PER_METRE;

interface FabricObject extends RoomGeometryObject {
  stroke?: string;
  data?: RoomGeometryObject["data"] & {
    captureAdapter?: string;
  };
}

export interface RoomInfo {
  label: string;
  areaM2: number;
  stroke: string;
  /** Present when the measured room came from RoomPlan. */
  captureAdapter?: string | null;
}

/** Shoelace formula — area of a polygon given its vertices (px²). */
export function shoelaceArea(pts: { x: number; y: number }[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

export function extractRooms(
  fabricJson: Record<string, unknown> | null | undefined,
): RoomInfo[] {
  if (!fabricJson) return [];
  const objects = (fabricJson.objects as FabricObject[] | undefined) ?? [];
  const pxPerMetre = resolvePxPerMetre(fabricJson);
  const rooms: RoomInfo[] = [];

  for (const obj of objects) {
    // RA-6839 (A0) + RA-7572: billed rooms are `data.type === "room"` or a
    // measured polygon. Metres-first area so a typed 3×3 room cannot become 0.
    if (!isMeasuredRoom(obj)) continue;
    const areaM2 = resolveRoomAreaM2(obj, pxPerMetre);
    if (areaM2 == null || areaM2 < 0.1) continue;

    rooms.push({
      label: roomLabel(obj),
      areaM2,
      stroke: obj.stroke ?? "#3b82f6",
      captureAdapter:
        typeof obj.data?.captureAdapter === "string"
          ? obj.data.captureAdapter
          : null,
    });
  }

  return rooms;
}
