/**
 * IICRC S500 Standard for Professional Water Damage Restoration
 * Dry Standard Thresholds by Material Type
 *
 * Values represent moisture content percentage (MC%) thresholds:
 *   dry   = reading ≤ dryThreshold
 *   drying = dryThreshold < reading ≤ wetThreshold
 *   wet   = reading > wetThreshold
 */

export interface DryStandard {
  material: string;
  label: string;
  dryThreshold: number; // ≤ this = DRY
  wetThreshold: number; // > this = WET (between = DRYING)
  unit: string; // "%" for most, "%" for all in this simplified model
  notes?: string;
}

export const IICRC_DRY_STANDARDS: DryStandard[] = [
  {
    material: "timber",
    label: "Timber / Hardwood",
    dryThreshold: 19,
    wetThreshold: 25,
    unit: "%",
  },
  {
    material: "softwood",
    label: "Softwood / Pine",
    dryThreshold: 19,
    wetThreshold: 25,
    unit: "%",
    notes: "Same as hardwood — varies by species",
  },
  {
    material: "plasterboard",
    label: "Plasterboard / Drywall",
    dryThreshold: 1.5,
    wetThreshold: 5,
    unit: "%",
  },
  {
    material: "concrete",
    label: "Concrete / Masonry",
    dryThreshold: 3.5,
    wetThreshold: 8,
    unit: "%",
  },
  {
    material: "carpet",
    label: "Carpet",
    dryThreshold: 3,
    wetThreshold: 10,
    unit: "%",
  },
  {
    material: "vinyl",
    label: "Vinyl / LVT",
    dryThreshold: 3.5,
    wetThreshold: 8,
    unit: "%",
  },
  {
    material: "particleboard",
    label: "Particleboard / MDF",
    dryThreshold: 10,
    wetThreshold: 18,
    unit: "%",
  },
  {
    material: "brick",
    label: "Brick / Render",
    dryThreshold: 4,
    wetThreshold: 10,
    unit: "%",
  },
  {
    material: "insulation",
    label: "Insulation (fibreglass)",
    dryThreshold: 2,
    wetThreshold: 8,
    unit: "%",
  },
  {
    material: "other",
    label: "Other / Unknown",
    dryThreshold: 15,
    wetThreshold: 25,
    unit: "%",
  },
];

export const METER_TYPES = [
  { value: "pin", label: "Pin Meter (invasive)" },
  { value: "non_invasive", label: "Non-Invasive / Pinless" },
  { value: "hygrometer", label: "Thermo-Hygrometer (RH%)" },
  { value: "infrared", label: "Infrared Thermometer" },
];

export function getDryStandard(material: string): DryStandard {
  return (
    IICRC_DRY_STANDARDS.find((s) => s.material === material) ??
    IICRC_DRY_STANDARDS.find((s) => s.material === "other")!
  );
}

export type MoistureStatus = "dry" | "drying" | "wet";

export function getMoistureStatus(
  level: number,
  material: string = "other",
): MoistureStatus {
  const std = getDryStandard(material);
  if (level <= std.dryThreshold) return "dry";
  if (level <= std.wetThreshold) return "drying";
  return "wet";
}

export const STATUS_COLORS: Record<
  MoistureStatus,
  { text: string; bg: string; border: string; dot: string }
> = {
  dry: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-300 dark:border-emerald-500/40",
    dot: "#10b981",
  },
  drying: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-300 dark:border-amber-500/40",
    dot: "#f59e0b",
  },
  wet: {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-300 dark:border-rose-500/40",
    dot: "#ef4444",
  },
};
