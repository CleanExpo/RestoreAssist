/**
 * RA-873: Storm Damage Equipment Calculator
 *
 * Storm jobs differ from routine water-damage: higher-volume bulk extraction
 * (trash pumps + truck-mount), standing-water pump-out, temporary shrink-wrap
 * envelopes for roof/window breaches. This calculator produces defensible
 * equipment counts from measured affected area, standing-water volume, and
 * expected drying duration.
 *
 * Ratios follow IICRC S500:2025 §7 (bulk extraction) + §9.3/§9.4 (evaporative
 * drying) with AU field practice for storm-scale extraction throughput.
 * Air mover + LGR dehumidifier ratios match the standard water calculator.
 */

export interface StormEquipmentInput {
  /** Floor area reached by storm water, in square metres. */
  affectedAreaM2: number;
  /** Estimated volume of standing water on-site, in litres. */
  stormWaterVolumeLitres: number;
  /** Expected drying duration in days (drives dehumidifier dwell). */
  estimatedDays: number;
}

export interface StormEquipmentResult {
  /** Truck-mount extraction units (high-throughput extraction). */
  truckMountExtractors: number;
  /** Submersible / trash pumps for standing water pump-out. */
  submersiblePumps: number;
  /** Axial air movers (IICRC S500 ratio — same as standard water). */
  airMovers: number;
  /** LGR dehumidifiers (per-day staffing for extended drying). */
  dehumidifiers: number;
  /** Shrink-wrap rolls required (in metres) for temporary envelope. */
  shrinkWrapRollsM: number;
}

// ─── Ratios ───────────────────────────────────────────────────────────────────

/** 1 submersible / trash pump per 500 L of standing water. */
const SUBMERSIBLE_LITRES_PER_UNIT = 500;
/** Hard cap — more pumps than this is impractical per crew. */
const SUBMERSIBLE_MAX = 8;
/** 1 truck-mount per 200 m² for storm-scale bulk extraction. */
const TRUCK_MOUNT_AREA_PER_UNIT = 200;
/** 1 air mover per 14 m² — IICRC S500:2025 §9.3.2. */
const AIR_MOVER_AREA_PER_UNIT = 14;
/** 1 LGR dehumidifier per 80 m² per day of drying. */
const LGR_AREA_PER_UNIT_PER_DAY = 80;
/** 20% overage on shrink-wrap perimeter to account for cuts/seams. */
const SHRINK_WRAP_OVERAGE = 1.2;

/**
 * Calculate storm-damage equipment counts.
 *
 * All quantities round UP (IICRC S500 §9.3.1 convention).
 */
export function calculateStormEquipment(
  params: StormEquipmentInput,
): StormEquipmentResult {
  const { affectedAreaM2, stormWaterVolumeLitres, estimatedDays } = params;

  // Clamp negatives to zero defensively.
  const areaM2 = Math.max(0, affectedAreaM2);
  const volumeL = Math.max(0, stormWaterVolumeLitres);
  const days = Math.max(0, estimatedDays);

  // Submersible pumps: 1 per 500 L, min 0, max 8.
  const submersiblePumps = Math.min(
    SUBMERSIBLE_MAX,
    Math.ceil(volumeL / SUBMERSIBLE_LITRES_PER_UNIT),
  );

  // Truck-mount extractors: 1 per 200 m².
  const truckMountExtractors = Math.ceil(areaM2 / TRUCK_MOUNT_AREA_PER_UNIT);

  // Air movers: 1 per 14 m² (IICRC standard).
  const airMovers = Math.ceil(areaM2 / AIR_MOVER_AREA_PER_UNIT);

  // Dehumidifiers: 1 LGR per 80 m² per day.
  const dehumidifiers = Math.ceil(
    (areaM2 * days) / LGR_AREA_PER_UNIT_PER_DAY,
  );

  // Shrink-wrap perimeter estimate: 4 × sqrt(area) metres + 20% overage.
  const shrinkWrapRollsM =
    4 * Math.sqrt(areaM2) * SHRINK_WRAP_OVERAGE;

  return {
    truckMountExtractors,
    submersiblePumps,
    airMovers,
    dehumidifiers,
    shrinkWrapRollsM,
  };
}
