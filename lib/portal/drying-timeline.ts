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

    const earliest = areaReadings[0];
    const latest = areaReadings[areaReadings.length - 1];
    const materialType = modeSurfaceType(areaReadings);

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

    const isDry = latest.moistureLevel <= dryThreshold;
    const gap = latest.moistureLevel - expectedTargetMC;
    const status: AreaDryingStatus =
      isDry || gap <= ON_TRACK_GAP_TOLERANCE ? "on-track" : "needs-attention";

    const estimateLabel = isDry
      ? DRY_COMPLETE_ESTIMATE_LABEL
      : buildProjectedEstimate(curve.projectedCompletionDay, daysElapsed, now, status);

    states.push({
      areaId: area.id,
      areaLabel: area.roomZoneId,
      status,
      estimateLabel,
    });
  }

  return states;
}

function buildProjectedEstimate(
  projectedCompletionDay: number,
  daysElapsed: number,
  now: Date,
  status: AreaDryingStatus,
): string {
  const daysRemaining = Math.max(projectedCompletionDay - daysElapsed, 0);
  const estimatedDryDate = new Date(now.getTime() + daysRemaining * MS_PER_DAY);
  const formattedDate = estimatedDryDate.toLocaleDateString(
    "en-AU",
    ESTIMATE_DATE_FORMAT,
  );

  return status === "on-track"
    ? `Estimate: on track — expected dry by ${formattedDate}.`
    : `Estimate: needs attention — revised estimate dry by ${formattedDate}.`;
}

function modeSurfaceType(readings: { surfaceType: string }[]): string {
  const counts: Record<string, number> = {};
  for (const r of readings) {
    counts[r.surfaceType] = (counts[r.surfaceType] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}
