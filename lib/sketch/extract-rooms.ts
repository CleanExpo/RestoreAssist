/**
 * Shared room-area extraction from the Fabric.js blob.
 *
 * Single source of truth used by BOTH the PDF generator (generate-sketch-pdf)
 * and the structured scope export (lib/export/scope-contract) so the human PDF
 * and the machine-readable export can never drift.
 */

/** Canvas scale: 100 pixels = 1 metre. */
export const PX_PER_METRE = 100;

interface FabricObject {
  type?: string;
  points?: { x: number; y: number }[];
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  fill?: string;
  stroke?: string;
  data?: { label?: string; roomType?: string; provenance?: string };
}

export interface RoomInfo {
  label: string;
  areaM2: number;
  stroke: string;
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
  const rooms: RoomInfo[] = [];

  for (const obj of objects) {
    if (obj.type?.toLowerCase() !== "polygon") continue;
    if (!obj.points?.length) continue;
    // RA-6839 (A0): provenance firewall — underlay_reference geometry
    // (AI/imported) is reference-only and must never contribute to billed/
    // scoped quantities. Filter here (the last point provenance is visible)
    // so no caller can leak it, regardless of upstream sanitisation.
    if (obj.data?.provenance === "underlay_reference") continue;

    const scaleX = obj.scaleX ?? 1;
    const scaleY = obj.scaleY ?? 1;
    const scaledPts = obj.points.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }));
    const areaM2 = shoelaceArea(scaledPts) / (PX_PER_METRE * PX_PER_METRE);

    rooms.push({
      label: obj.data?.label ?? obj.data?.roomType ?? "Room",
      areaM2,
      stroke: obj.stroke ?? "#3b82f6",
    });
  }

  return rooms;
}
