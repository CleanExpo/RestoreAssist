/**
 * sketch-estimate-extractor.ts — RA2-053 (RA-123)
 *
 * Extracts structured estimate data from Fabric.js sketch JSON +
 * moisture/equipment point data saved in ClaimSketch.
 *
 * Output flows into:
 *  - Cost estimation (line items by room/damage area)
 *  - Equipment schedule (from MoistureMappingCanvas equipment points)
 *  - Affected material quantities (from damage zone polygons)
 */

import {
  isMeasuredRoom,
  objectPoints,
  resolvePxPerMetre,
  resolveRoomAreaM2,
  resolveWallAreaM2,
  roomLabel,
  type RoomGeometryObject,
} from "@/lib/sketch/room-area-from-geometry";
import { isOperatorMeasuredProvenance } from "@/lib/sketch/measured-provenance";

// ── Scale ─────────────────────────────────────────────────
/** Default: 100 canvas pixels = 1 metre */
const PX_PER_METRE = 100;
const PX2_PER_M2 = PX_PER_METRE * PX_PER_METRE;
const MIN_BILLED_AREA_M2 = 0.1;

// ── IICRC S500 Equipment Ratios ───────────────────────────
const IICRC_RATIOS = {
  dehumidifier: 40, // 1 unit per 40 m²
  airMover: 15, // 1 unit per 15 m²
  airScrubber: 100, // 1 unit per 100 m²
} as const;

// ── Types ─────────────────────────────────────────────────

export type EstimateCategory =
  | "room" // Regular room area
  | "damage" // Damage zone area
  | "equipment" // Equipment from placement data
  | "material"; // Derived material quantity

export interface EstimateLineItem {
  id: string;
  category: EstimateCategory;
  description: string;
  quantity: number;
  unit: string;
  areaM2?: number;
  /** Source floor label (e.g. "Ground Floor") */
  floor?: string;
  notes?: string;
  /**
   * Geometry provenance from the Fabric object / SketchRoom.
   * Seeded onto estimate lines so the UI action can keep operator_measured
   * rooms only without changing the extractor skip filters (RA-7611).
   */
  provenance?: string | null;
}

export interface SketchEstimate {
  lineItems: EstimateLineItem[];
  totalRoomAreaM2: number;
  totalDamageAreaM2: number;
  extractedAt: string;
}

// ── Geometry helpers ──────────────────────────────────────

/** Shoelace formula — area of a closed polygon given vertices. */
function shoelaceAreaPx2(pts: { x: number; y: number }[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/** Convert canvas-pixel² area to m², applying object scale. */
function pxAreaToM2(
  points: { x: number; y: number }[],
  scaleX = 1,
  scaleY = 1,
): number {
  const scaledPts = points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
  return shoelaceAreaPx2(scaledPts) / PX2_PER_M2;
}

// ── Fabric.js polygon extraction ──────────────────────────

interface FabricObject extends RoomGeometryObject {
  fill?: string;
  stroke?: string;
  data?: RoomGeometryObject["data"] & {
    isDamageZone?: boolean;
    provenance?: string;
  };
}

/** Damage zone stroke colour from SketchEditor ROOM_COLORS */
const DAMAGE_ZONE_STROKE = "#ef4444";

function isFabricDamageZone(obj: FabricObject): boolean {
  if (obj.data?.isDamageZone) return true;
  if (obj.stroke === DAMAGE_ZONE_STROKE) return true;
  const label = (obj.data?.label ?? obj.data?.roomType ?? "").toLowerCase();
  return label.includes("damage") || label.includes("affected");
}

function extractRoomsFromFabricJson(
  fabricJson: Record<string, unknown> | null | undefined,
  floorLabel: string,
): { rooms: EstimateLineItem[]; damage: EstimateLineItem[] } {
  const rooms: EstimateLineItem[] = [];
  const damage: EstimateLineItem[] = [];

  if (!fabricJson?.objects || !Array.isArray(fabricJson.objects)) {
    return { rooms, damage };
  }

  const objects = fabricJson.objects as FabricObject[];
  const pxPerMetre = resolvePxPerMetre(fabricJson);
  let roomIdx = 0;
  let damageIdx = 0;

  for (const obj of objects) {
    // RA-6839 / RA-7611: only operator_measured geometry may become a billed
    // room or damage line item. Defence in depth with isMeasuredRoom below.
    if (!isOperatorMeasuredProvenance(obj.data?.provenance)) continue;

    if (isFabricDamageZone(obj)) {
      const areaM2 =
        resolveRoomAreaM2(obj, pxPerMetre) ??
        (obj.points?.length
          ? pxAreaToM2(objectPoints(obj), obj.scaleX, obj.scaleY)
          : 0);
      if (areaM2 < MIN_BILLED_AREA_M2) continue;
      damageIdx++;
      const label = roomLabel(obj);
      damage.push({
        id: `dmg-${floorLabel}-${damageIdx}`,
        category: "damage",
        description: `Damage Zone ${damageIdx} — ${floorLabel}`,
        quantity: areaM2,
        unit: "m²",
        areaM2,
        floor: floorLabel,
        notes: label !== "Room" && label !== "Damage Zone" ? label : undefined,
      });
      continue;
    }

    // RA-7572: rooms are `data.type === "room"` (or a measured polygon).
    // Area is metres-first so a saved 3×3 room cannot yield 0 silently.
    if (!isMeasuredRoom(obj)) continue;
    const areaM2 = resolveRoomAreaM2(obj, pxPerMetre);
    if (areaM2 == null || areaM2 < MIN_BILLED_AREA_M2) continue;

    roomIdx++;
    const label = roomLabel(obj);
    rooms.push({
      id: `room-${floorLabel}-${roomIdx}`,
      category: "room",
      description: `${label} — ${floorLabel}`,
      quantity: areaM2,
      unit: "m²",
      areaM2,
      floor: floorLabel,
      notes: "Floor area",
      provenance: obj.data?.provenance ?? null,
    });

    const wallM2 = resolveWallAreaM2(obj, pxPerMetre);
    if (wallM2 != null && wallM2 >= MIN_BILLED_AREA_M2) {
      rooms.push({
        id: `room-${floorLabel}-${roomIdx}-walls`,
        category: "room",
        description: `${label} walls — ${floorLabel}`,
        quantity: wallM2,
        unit: "m²",
        areaM2: wallM2,
        floor: floorLabel,
        notes: "Wall area (perimeter × ceiling height)",
        provenance: obj.data?.provenance ?? null,
      });
    }
  }

  return { rooms, damage };
}

// ── Equipment point extraction ────────────────────────────

interface EquipmentPoint {
  type: string; // "dehumidifier" | "air_mover" | "air_scrubber"
  label?: string;
}

/** EquipmentType labels as stored in MoistureMappingCanvas.EQUIPMENT_TYPES */
const EQUIPMENT_LABEL_MAP: Record<string, string> = {
  dehumidifier: "Dehumidifier",
  air_mover: "Air Mover",
  air_scrubber: "Air Scrubber",
  dehu: "Dehumidifier",
  "air mover": "Air Mover",
  "air scrubber": "Air Scrubber",
};

function extractEquipmentLineItems(
  equipmentPoints: unknown[] | null | undefined,
  floorLabel: string,
): EstimateLineItem[] {
  if (!Array.isArray(equipmentPoints) || !equipmentPoints.length) return [];

  const counts: Record<string, number> = {};
  for (const pt of equipmentPoints) {
    const ep = pt as EquipmentPoint;
    const type = ep.type?.toLowerCase().replace(/\s+/g, "_") ?? "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }

  return Object.entries(counts).map(([type, count], i) => ({
    id: `equip-${floorLabel}-${i}`,
    category: "equipment",
    description: `${EQUIPMENT_LABEL_MAP[type] ?? type} — ${floorLabel}`,
    quantity: count,
    unit: "units",
    floor: floorLabel,
  }));
}

// ── Derived material quantities ───────────────────────────

const MATERIALS_PER_M2: { description: string; rate: number; unit: string }[] =
  [
    { description: "Wall drying treatment", rate: 1, unit: "m²" },
    { description: "Floor drying treatment", rate: 1, unit: "m²" },
    {
      description: "Plasterboard replacement (20% wastage)",
      rate: 1.2,
      unit: "m²",
    },
  ];

function deriveMaterialItems(
  totalDamageAreaM2: number,
  floorLabel: string,
): EstimateLineItem[] {
  if (totalDamageAreaM2 < 0.1) return [];
  return MATERIALS_PER_M2.map((m, i) => ({
    id: `mat-${floorLabel}-${i}`,
    category: "material",
    description: `${m.description} — ${floorLabel}`,
    quantity: Math.ceil(totalDamageAreaM2 * m.rate * 10) / 10,
    unit: m.unit,
    floor: floorLabel,
    notes: `Based on ${totalDamageAreaM2.toFixed(1)} m² damage zone`,
  }));
}

// ── IICRC equipment recommendations ──────────────────────

/** Suggest equipment quantities for a given affected area if no equipment was manually placed. */
export function recommendEquipment(affectedAreaM2: number): {
  dehumidifiers: number;
  airMovers: number;
  airScrubbers: number;
} {
  return {
    dehumidifiers: Math.max(
      1,
      Math.ceil(affectedAreaM2 / IICRC_RATIOS.dehumidifier),
    ),
    airMovers: Math.max(1, Math.ceil(affectedAreaM2 / IICRC_RATIOS.airMover)),
    airScrubbers: Math.max(
      1,
      Math.ceil(affectedAreaM2 / IICRC_RATIOS.airScrubber),
    ),
  };
}

// ── Main export ───────────────────────────────────────────

/** RoomGraph row already stored in metres — used when Fabric parse yields none. */
export interface SavedSketchRoom {
  name?: string | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  heightM?: number | null;
  provenance?: string | null;
}

export interface SketchFloorData {
  floorLabel: string;
  sketchData?: Record<string, unknown> | null;
  equipmentPoints?: unknown[] | null;
  moisturePoints?: unknown[] | null;
  savedRooms?: SavedSketchRoom[] | null;
}

function isFloorAreaLine(item: EstimateLineItem): boolean {
  if (item.category !== "room") return false;
  if (item.id.endsWith("-walls")) return false;
  if (item.notes?.startsWith("Wall area")) return false;
  return true;
}

function roomsFromSavedGraph(
  saved: SavedSketchRoom[] | null | undefined,
  floorLabel: string,
): EstimateLineItem[] {
  if (!Array.isArray(saved) || saved.length === 0) return [];
  const lines: EstimateLineItem[] = [];
  let idx = 0;
  for (const room of saved) {
    // RA-7611: allow-list — saved SketchRoom rows bill only when confirmed
    // as operator_measured. ai_suggested and underlay_reference yield nothing.
    if (!isOperatorMeasuredProvenance(room.provenance)) continue;
    const areaM2 = room.areaM2;
    if (typeof areaM2 !== "number" || !Number.isFinite(areaM2) || areaM2 < MIN_BILLED_AREA_M2) {
      continue;
    }
    idx++;
    const label = (room.name ?? "").trim() || "Room";
    lines.push({
      id: `room-${floorLabel}-${idx}`,
      category: "room",
      description: `${label} — ${floorLabel}`,
      quantity: areaM2,
      unit: "m²",
      areaM2,
      floor: floorLabel,
      notes: "Floor area",
      provenance: room.provenance ?? null,
    });
    const height = room.heightM;
    const peri = room.perimeterM;
    if (
      typeof height === "number" &&
      height > 0 &&
      typeof peri === "number" &&
      peri > 0
    ) {
      const wallM2 = peri * height;
      if (wallM2 >= MIN_BILLED_AREA_M2) {
        lines.push({
          id: `room-${floorLabel}-${idx}-walls`,
          category: "room",
          description: `${label} walls — ${floorLabel}`,
          quantity: wallM2,
          unit: "m²",
          areaM2: wallM2,
          floor: floorLabel,
          notes: "Wall area (perimeter × ceiling height)",
          provenance: room.provenance ?? null,
        });
      }
    }
  }
  return lines;
}

/**
 * Extract structured estimate line items from all sketch floors for an inspection.
 *
 * Pass the ClaimSketch records from the DB (sketchData, equipmentPoints, floorLabel).
 */
export function extractSketchEstimate(
  floors: SketchFloorData[],
): SketchEstimate {
  const allLineItems: EstimateLineItem[] = [];
  let totalRoomAreaM2 = 0;
  let totalDamageAreaM2 = 0;

  for (const floor of floors) {
    const { rooms, damage } = extractRoomsFromFabricJson(
      floor.sketchData,
      floor.floorLabel,
    );
    // RA-7572: SketchRoom.areaM2 is already metres. If the Fabric blob did
    // not yield room lines, the saved room graph still must reach the estimate.
    const roomLines =
      rooms.length > 0
        ? rooms
        : roomsFromSavedGraph(floor.savedRooms, floor.floorLabel);

    allLineItems.push(...roomLines, ...damage);

    // Floor only — wall lines stay on the estimate but must not inflate
    // totalRoomAreaM2 (callers treat that as measured floor area).
    const floorRoomArea = roomLines
      .filter(isFloorAreaLine)
      .reduce((s, r) => s + (r.areaM2 ?? 0), 0);
    const floorDamageArea = damage.reduce((s, d) => s + (d.areaM2 ?? 0), 0);

    totalRoomAreaM2 += floorRoomArea;
    totalDamageAreaM2 += floorDamageArea;

    // Equipment from placement tool
    const equip = extractEquipmentLineItems(
      floor.equipmentPoints,
      floor.floorLabel,
    );
    allLineItems.push(...equip);

    // If damage zones exist but no equipment placed, add IICRC recommendations
    if (floorDamageArea > 0 && equip.length === 0) {
      const rec = recommendEquipment(floorDamageArea);
      const equipRec: EstimateLineItem[] = [
        {
          id: `recequip-${floor.floorLabel}-dh`,
          category: "equipment",
          description: `Dehumidifier (IICRC recommended) — ${floor.floorLabel}`,
          quantity: rec.dehumidifiers,
          unit: "units",
          floor: floor.floorLabel,
          notes: `IICRC S500: 1 per ${IICRC_RATIOS.dehumidifier}m²`,
        },
        {
          id: `recequip-${floor.floorLabel}-am`,
          category: "equipment",
          description: `Air Mover (IICRC recommended) — ${floor.floorLabel}`,
          quantity: rec.airMovers,
          unit: "units",
          floor: floor.floorLabel,
          notes: `IICRC S500: 1 per ${IICRC_RATIOS.airMover}m²`,
        },
        {
          id: `recequip-${floor.floorLabel}-as`,
          category: "equipment",
          description: `Air Scrubber (IICRC recommended) — ${floor.floorLabel}`,
          quantity: rec.airScrubbers,
          unit: "units",
          floor: floor.floorLabel,
          notes: `IICRC S500: 1 per ${IICRC_RATIOS.airScrubber}m²`,
        },
      ];
      allLineItems.push(...equipRec);
    }

    // Derived materials from damage area
    allLineItems.push(
      ...deriveMaterialItems(floorDamageArea, floor.floorLabel),
    );
  }

  return {
    lineItems: allLineItems,
    totalRoomAreaM2,
    totalDamageAreaM2,
    extractedAt: new Date().toISOString(),
  };
}
