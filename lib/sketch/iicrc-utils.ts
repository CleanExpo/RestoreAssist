/**
 * iicrc-utils.ts — IICRC S500:2021 moisture classification helpers
 *
 * References:
 *  - IICRC S500:2021 §7.1  Water damage categories (1–3)
 *  - IICRC S500:2021 §8.1  Moisture levels and drying classes (1–4)
 */

// ── Moisture Classes ──────────────────────────────────────────

export type IicrClass = 1 | 2 | 3 | 4;

export interface IicrClassInfo {
  class: IicrClass;
  label: string;
  /** Short description for tooltips */
  description: string;
  /** Tailwind-compatible hex colour for UI pins */
  color: string;
  /** Moisture content threshold range (% WME) for this class */
  thresholdMin: number;
  thresholdMax: number;
}

/** IICRC S500:2021 §8.1 — Moisture class definitions */
export const IICRC_CLASSES: IicrClassInfo[] = [
  {
    class: 1,
    label: "Class 1",
    description: "Least amount of water, absorption and evaporation",
    color: "#22c55e", // green-500
    thresholdMin: 0,
    thresholdMax: 15,
  },
  {
    class: 2,
    label: "Class 2",
    description: "Large amount of water, absorption and evaporation",
    color: "#eab308", // yellow-500
    thresholdMin: 15,
    thresholdMax: 25,
  },
  {
    class: 3,
    label: "Class 3",
    description: "Greatest amount of water, absorption and evaporation",
    color: "#f97316", // orange-500
    thresholdMin: 25,
    thresholdMax: 40,
  },
  {
    class: 4,
    label: "Class 4",
    description: "Specialty drying — low permeance/porosity materials",
    color: "#ef4444", // red-500
    thresholdMin: 40,
    thresholdMax: Infinity,
  },
];

/**
 * Derive IICRC moisture class from a WME % reading.
 * IICRC S500:2021 §8.1
 */
export function deriveIicrClass(wmePercent: number): IicrClass {
  if (wmePercent < 15) return 1;
  if (wmePercent < 25) return 2;
  if (wmePercent < 40) return 3;
  return 4;
}

export function getClassInfo(cls: IicrClass): IicrClassInfo {
  return IICRC_CLASSES[cls - 1];
}

// ── Material types (IICRC S500:2021 §7.1) ────────────────────

export const MATERIAL_TYPES = [
  { id: "timber_floor", label: "Timber Floor", dryTargetWme: 12 },
  { id: "carpet", label: "Carpet", dryTargetWme: 14 },
  { id: "plasterboard", label: "Plasterboard", dryTargetWme: 16 },
  { id: "concrete", label: "Concrete Slab", dryTargetWme: 14 },
  { id: "brick", label: "Brick / Masonry", dryTargetWme: 16 },
  { id: "insulation", label: "Insulation", dryTargetWme: 18 },
  { id: "tile", label: "Tile / Grout", dryTargetWme: 14 },
  { id: "other", label: "Other", dryTargetWme: 16 },
] as const;

export type MaterialTypeId = (typeof MATERIAL_TYPES)[number]["id"];

export function getMaterialType(id: MaterialTypeId) {
  return MATERIAL_TYPES.find((m) => m.id === id);
}

// ── Equipment ratios (IICRC S500:2021 §8.3) ──────────────────

/** Recommended equipment counts per m² (IICRC S500:2021 §8.3) */
export const IICRC_EQUIPMENT_RATIOS = {
  dehumidifier: 40, // 1 per 40 m²
  airMover: 15, // 1 per 15 m²
  airScrubber: 100, // 1 per 100 m²
} as const;

export type EquipmentType = keyof typeof IICRC_EQUIPMENT_RATIOS;

export function recommendedEquipment(
  totalM2: number,
): Record<EquipmentType, number> {
  return {
    dehumidifier: Math.ceil(totalM2 / IICRC_EQUIPMENT_RATIOS.dehumidifier),
    airMover: Math.ceil(totalM2 / IICRC_EQUIPMENT_RATIOS.airMover),
    airScrubber: Math.ceil(totalM2 / IICRC_EQUIPMENT_RATIOS.airScrubber),
  };
}
