/**
 * Per-area drying timeline — client-safe curated states (client portal Phase 5 / RA-6950).
 *
 * Projects each affected area's drying trajectory using the same IICRC S500
 * exponential-decay model as the technician-facing drying goal
 * (lib/drying/target-curve.ts), then collapses the projection into a curated
 * on-track / needs-attention state with a plain-English "estimate" label.
 *
 * Moisture-content readings are legal exhibits (drying logs) — this module
 * NEVER returns a raw reading or MC% value, only the derived state and a
 * calendar-date estimate.
 */

import { computeTargetCurve } from "@/lib/drying/target-curve";
import { getDryStandard } from "@/lib/iicrc-dry-standards";

const DEFAULT_CATEGORY = "Category 2";
const DEFAULT_CLASS = "Class 2";
// S500:2021 §12.2.2 reference conditions used by the target-curve model
// (see lib/drying/target-curve.ts REF_ROOM_M3 / REF_DEHU_LPD) — the portal
// has no per-area room-volume/dehumidifier-capacity fields to draw on, so it
// projects against the same reference conditions the drying-goal route falls
// back to when a technician hasn't supplied them.
const DEFAULT_ROOM_VOLUME_M3 = 25;
const DEFAULT_DEHU_CAPACITY_LPD = 50;

// Gap (MC percentage points) an area may sit above the expected target curve
// before it's flagged "needs-attention" — absorbs normal reading-to-reading
// noise without alarming the client over routine variance.
const ON_TRACK_GAP_TOLERANCE = 5;

const MS_PER_DAY = 86_400_000;

const ESTIMATE_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
};

export type AreaDryingStatus = "on-track" | "needs-attention";

export interface AreaDryingState {
  areaId: string;
  areaLabel: string;
  status: AreaDryingStatus;
  estimateLabel: string;
}

// Curated "drying complete" marker — the only signal the digest (RA-6951)
// uses to derive "X of Y areas at drying goal". Kept as the exact string
// buildDryingTimeline already emits below, so no new field is added to the
// legally-guarded AreaDryingState shape (see the "never exposes raw..." test).
export const DRY_COMPLETE_ESTIMATE_LABEL =
  "Estimate: drying complete for this area.";

export function isAreaAtDryingGoal(
  state: Pick<AreaDryingState, "estimateLabel">,
): boolean {
  return state.estimateLabel === DRY_COMPLETE_ESTIMATE_LABEL;
}

export interface DryingTimelineReadingInput {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  recordedAt: Date | string;
}

export interface DryingTimelineAreaInput {
  id: string;
  roomZoneId: string;
}

export interface BuildDryingTimelineInput {
  areas: DryingTimelineAreaInput[];
  readings: DryingTimelineReadingInput[];
  /** From DryingGoalRecord.targetCategory — defaults to "Category 2" when not yet set. */
  targetCategory?: string | null;
  /** From DryingGoalRecord.targetClass — defaults to "Class 2" when not yet set. */
  targetClass?: string | null;
  /** Injectable for deterministic tests; defaults to the current time. */
  now?: Date;
}

/**
 * Build the curated per-area drying timeline for the client portal.
 *
 * Areas with no moisture readings yet are omitted (nothing to project).
 */
export function buildDryingTimeline(
  input: BuildDryingTimelineInput,
): AreaDryingState[] {
  const now = input.now ?? new Date();
  const category = input.targetCategory ?? DEFAULT_CATEGORY;
  const waterClass = input.targetClass ?? DEFAULT_CLASS;

  const states: AreaDryingState[] = [];

  for (const area of input.areas) {
    const areaReadings = input.readings
      .filter((r) => r.location === area.roomZoneId)
      .map((r) => ({ ...r, recordedAt: new Date(r.recordedAt) }))
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    if (areaReadings.length === 0) continue;

    // RA-8536: an area can hold readings on several materials (timber floor,
    // plasterboard wall). Each material is judged on its own latest reading
    // against its own drying goal — never against another material's goal.
    const materials = groupBySurfaceType(areaReadings).map((readings) =>
      assessMaterial(readings, now, category, waterClass),
    );

    // Complete only when every monitored material is at its own goal.
    const allDry = materials.every((m) => m.isDry);
    const wetMaterials = materials.filter((m) => !m.isDry);
    const status: AreaDryingStatus = wetMaterials.some(
      (m) => m.gap > ON_TRACK_GAP_TOLERANCE,
    )
      ? "needs-attention"
      : "on-track";

    const estimateLabel = allDry
      ? DRY_COMPLETE_ESTIMATE_LABEL
      : buildProjectedEstimate(
          // The area is dry when its slowest material is.
          Math.max(...wetMaterials.map((m) => m.daysRemaining)),
          now,
          status,
        );

    states.push({
      areaId: area.id,
      areaLabel: area.roomZoneId,
      status,
      estimateLabel,
    });
  }

  return states;
}

interface MaterialAssessment {
  isDry: boolean;
  /** MC percentage points above the expected target curve today. */
  gap: number;
  daysRemaining: number;
}

/**
 * Assess one material's readings (sorted oldest first, all the same
 * surfaceType) against that material's own drying goal — the same
 * getDryStandard() lookup the technician drying-goal check uses per reading.
 */
function assessMaterial(
  readings: { surfaceType: string; moistureLevel: number; recordedAt: Date }[],
  now: Date,
  category: string,
  waterClass: string,
): MaterialAssessment {
  const earliest = readings[0];
  const latest = readings[readings.length - 1];
  const materialType = earliest.surfaceType;

  const curve = computeTargetCurve({
    initialMC: earliest.moistureLevel,
    materialType,
    category,
    waterClass,
    roomVolumeM3: DEFAULT_ROOM_VOLUME_M3,
    dehumidifierCapacityLpd: DEFAULT_DEHU_CAPACITY_LPD,
  });

  const daysElapsed = Math.max(
    0,
    Math.floor((now.getTime() - earliest.recordedAt.getTime()) / MS_PER_DAY),
  );
  const dayIndex = Math.min(daysElapsed, curve.daily.length - 1);
  const expectedTargetMC = curve.daily[dayIndex].targetMC;
  const dryThreshold = getDryStandard(materialType).dryThreshold;

  return {
    isDry: latest.moistureLevel <= dryThreshold,
    gap: latest.moistureLevel - expectedTargetMC,
    daysRemaining: Math.max(curve.projectedCompletionDay - daysElapsed, 0),
  };
}

function buildProjectedEstimate(
  daysRemaining: number,
  now: Date,
  status: AreaDryingStatus,
): string {
  const estimatedDryDate = new Date(now.getTime() + daysRemaining * MS_PER_DAY);
  const formattedDate = estimatedDryDate.toLocaleDateString(
    "en-AU",
    ESTIMATE_DATE_FORMAT,
  );

  return status === "on-track"
    ? `Estimate: on track — expected dry by ${formattedDate}.`
    : `Estimate: needs attention — revised estimate dry by ${formattedDate}.`;
}

/** Split readings by surfaceType, preserving each group's chronological order. */
function groupBySurfaceType<T extends { surfaceType: string }>(
  readings: T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of readings) {
    const group = groups.get(r.surfaceType);
    if (group) group.push(r);
    else groups.set(r.surfaceType, [r]);
  }
  return [...groups.values()];
}
