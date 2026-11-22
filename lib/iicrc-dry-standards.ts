/**
 * Moisture drying goals (RA-8508).
 *
 * The drying goal for a material is the job's reference reading: a reading
 * taken from unaffected like material in the same building (a MoistureReading
 * with `isBaseline`). When no reference reading exists, the fixed values below
 * are used as a starting guide only.
 *
 * The guide values have no cited source. They are not a published standard and
 * must never be labelled as one (no standard name beside them in the UI,
 * reports, emails or AI prompts). The path of this file is historical.
 *
 * Guide status bands (MC%):
 *   dry    = reading <= dryThreshold
 *   drying = dryThreshold < reading <= wetThreshold
 *   wet    = reading > wetThreshold
 */

import { isMoistureContentUnit } from "@/lib/moisture/units";

export interface DryStandard {
  material: string;
  label: string;
  dryThreshold: number; // <= this = DRY
  wetThreshold: number; // > this = WET (between = DRYING)
  unit: string; // "%" for all in this simplified model
  notes?: string;
}

/** Shown wherever a guide value is displayed in place of a reference reading. */
export const MOISTURE_GUIDE_LABEL = "Starting guide only, not a standard";

/** What the contractor should do instead of relying on the guide. */
export const MOISTURE_GUIDE_HINT =
  "Replace it with a reference reading taken from unaffected like material in the same building.";

/** How a reference-based goal is described. */
export const REFERENCE_READING_LABEL =
  "Reference reading from unaffected like material in the same building";

export const MOISTURE_GUIDE_VALUES: DryStandard[] = [
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

/** The guide row for a material, matched ignoring case and spaces (falls back to "other"). */
export function getDryStandard(material: string): DryStandard {
  const key = materialKey(material);
  return (
    MOISTURE_GUIDE_VALUES.find((s) => s.material === key) ??
    MOISTURE_GUIDE_VALUES.find((s) => s.material === "other")!
  );
}

export type MoistureStatus = "dry" | "drying" | "wet";

/**
 * Status of a reading. With a reference reading the goal is that reading:
 * at or below it is dry. Above it, the guide's wet band only sets the colour
 * (drying or wet); it never moves the goal.
 */
export function getMoistureStatus(
  level: number,
  material: string = "other",
  referenceMc?: number | null,
): MoistureStatus {
  const std = getDryStandard(material);
  if (typeof referenceMc === "number" && Number.isFinite(referenceMc)) {
    if (level <= referenceMc) return "dry";
    return level > Math.max(std.wetThreshold, referenceMc) ? "wet" : "drying";
  }
  if (level <= std.dryThreshold) return "dry";
  if (level <= std.wetThreshold) return "drying";
  return "wet";
}

// ── Reference readings ───────────────────────────────────────────────────────

export type DryingGoalBasis = "reference" | "guide";

export interface DryingGoal {
  target: number;
  basis: DryingGoalBasis;
}

/**
 * `unit` is a required key (RA-8508 review): a reader that does not select the
 * unit cannot pass its rows here, so an RH reading can never silently become a
 * moisture-content reference. `null` means no unit was recorded.
 */
export interface ReferenceCandidate {
  surfaceType?: string | null;
  moistureLevel?: number | null;
  isBaseline: boolean | null | undefined;
  unit: string | null | undefined;
  invalidatedAt: Date | string | null | undefined;
  recordedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/** Material key used to match a reference reading to a monitored reading. */
export function materialKey(surfaceType: string | null | undefined): string {
  return (surfaceType ?? "").trim().toLowerCase();
}

/**
 * The one rule for which readings count as drying progress: not a reference
 * (baseline) reading and not invalidated. Every reader filters with this.
 */
export function isProgressReading(r: {
  // Required keys (RA-8508 review): a reader must select both, or pass an
  // explicit null when its query already excludes invalidated rows.
  isBaseline: boolean | null | undefined;
  invalidatedAt: Date | string | null | undefined;
}): boolean {
  return !r.isBaseline && !r.invalidatedAt;
}

function timestamp(r: ReferenceCandidate): number {
  const raw = r.recordedAt ?? r.createdAt;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Reference reading per material: the newest valid baseline reading
 * (`isBaseline`, not invalidated, moisture-content unit) for that material.
 * Relative-humidity and other non-MC readings are never used
 * (lib/moisture/units.ts owns that rule).
 */
export function pickReferenceReadings(
  readings: ReadonlyArray<ReferenceCandidate>,
): Record<string, number> {
  const newest = new Map<string, { mc: number; at: number }>();
  for (const r of readings) {
    if (!r.isBaseline || r.invalidatedAt) continue;
    if (!isMoistureContentUnit(r.unit)) continue;
    const mc = r.moistureLevel;
    if (typeof mc !== "number" || !Number.isFinite(mc)) continue;
    const key = materialKey(r.surfaceType);
    if (!key) continue;
    const at = timestamp(r);
    const prev = newest.get(key);
    if (!prev || at >= prev.at) newest.set(key, { mc, at });
  }
  const out: Record<string, number> = {};
  for (const [key, v] of newest) out[key] = v.mc;
  return out;
}

/**
 * The drying goal for a material: the reference reading when one exists,
 * otherwise the stored target (a guide snapshot) or the guide value. A
 * reference applies only to a moisture-content reading (`unit`); an RH or
 * temperature reading keeps the guide behaviour it had before RA-8508.
 */
export function resolveDryingGoal(
  material: string,
  references: Record<string, number> = {},
  storedTarget?: number | null,
  unit?: string | null,
): DryingGoal {
  const ref = isMoistureContentUnit(unit) ? references[materialKey(material)] : undefined;
  if (typeof ref === "number" && Number.isFinite(ref)) {
    return { target: ref, basis: "reference" };
  }
  if (typeof storedTarget === "number" && Number.isFinite(storedTarget)) {
    return { target: storedTarget, basis: "guide" };
  }
  return { target: getDryStandard(material).dryThreshold, basis: "guide" };
}

export interface MonitoredReading {
  id?: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  /** Required key: see ReferenceCandidate. */
  unit: string | null | undefined;
  recordedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface DryingGoalGap {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  target: number;
  basis: DryingGoalBasis;
  gap: number;
}

export interface DryingGoalEvaluation {
  failing: DryingGoalGap[];
  snapshot: Array<Record<string, unknown>>;
  /** Distinct bases used across all readings, reference first. */
  bases: DryingGoalBasis[];
}

/** Evaluates monitored readings against their drying goals (reference first). */
export function evaluateDryingGoal(
  readings: ReadonlyArray<MonitoredReading>,
  storedTargets: Record<string, number> = {},
  references: Record<string, number> = {},
): DryingGoalEvaluation {
  const failing: DryingGoalGap[] = [];
  const snapshot: Array<Record<string, unknown>> = [];
  const used = new Set<DryingGoalBasis>();
  // Stored snapshot keys are guide material keys ("plasterboard"); match the
  // reading's surfaceType to them ignoring case and spaces.
  const stored: Record<string, number> = {};
  for (const [k, v] of Object.entries(storedTargets)) stored[materialKey(k)] = v;
  for (const r of readings) {
    const goal = resolveDryingGoal(
      r.surfaceType,
      references,
      stored[materialKey(r.surfaceType)],
      r.unit,
    );
    used.add(goal.basis);
    snapshot.push({
      id: r.id,
      location: r.location,
      surfaceType: r.surfaceType,
      moistureLevel: r.moistureLevel,
      target: goal.target,
      targetBasis: goal.basis,
      timestamp: r.recordedAt ?? r.createdAt,
    });
    if (r.moistureLevel > goal.target) {
      failing.push({
        location: r.location,
        surfaceType: r.surfaceType,
        moistureLevel: r.moistureLevel,
        target: goal.target,
        basis: goal.basis,
        gap: parseFloat((r.moistureLevel - goal.target).toFixed(2)),
      });
    }
  }
  const bases = (["reference", "guide"] as const).filter((b) => used.has(b));
  return { failing, snapshot, bases };
}

// ── Report rows (PDF Sections 4 and 9) ───────────────────────────────────────

export type MoistureRowStatus = "WITHIN GOAL" | "MONITORING" | "ABOVE GOAL" | "REFERENCE" | "—";

export interface MoistureRowInput {
  material?: string | null;
  surfaceType?: string | null;
  moistureLevel?: number | string | null;
  isBaseline?: boolean | null;
  /** Required key: see ReferenceCandidate. */
  unit: string | null | undefined;
}

/**
 * Status of one progress reading against its drying goal (reference first,
 * then the stored snapshot, then the guide). Every reader that colours or
 * counts a reading calls this; none compares numbers itself.
 */
export function readingGoalStatus(
  reading: { surfaceType: string; moistureLevel: number; unit: string | null | undefined },
  references: Record<string, number>,
  storedTarget?: number | null,
): { goal: DryingGoal; status: MoistureStatus } {
  const goal = resolveDryingGoal(reading.surfaceType, references, storedTarget, reading.unit);
  const status = getMoistureStatus(
    reading.moistureLevel,
    reading.surfaceType,
    goal.basis === "reference" ? goal.target : undefined,
  );
  return { goal, status };
}

/**
 * Goal text and status for one moisture table row, from the owner's goal
 * (reference first, then the guide). A reference reading is labelled as one
 * and never judged against itself.
 */
export function moistureRowGoal(
  row: MoistureRowInput,
  references: Record<string, number>,
): { goalText: string; status: MoistureRowStatus; basis: DryingGoalBasis } {
  const material = row.surfaceType ?? row.material ?? "other";
  const goal = resolveDryingGoal(material, references, undefined, row.unit);
  const goalText = `≤${goal.target}%`;
  if (row.isBaseline) return { goalText, status: "REFERENCE", basis: goal.basis };
  const level = typeof row.moistureLevel === "number" ? row.moistureLevel : parseFloat(String(row.moistureLevel ?? ""));
  if (!Number.isFinite(level)) return { goalText, status: "—", basis: goal.basis };
  const { status } = readingGoalStatus(
    { surfaceType: material, moistureLevel: level, unit: row.unit },
    references,
  );
  return {
    goalText,
    status: status === "dry" ? "WITHIN GOAL" : status === "drying" ? "MONITORING" : "ABOVE GOAL",
    basis: goal.basis,
  };
}

export interface DryingGoalTableRow {
  material: string;
  target: number;
  basis: DryingGoalBasis;
}

/**
 * The drying goal table: one row per material with a reference reading, plus
 * a guide row for every monitored material without one. With no readings at
 * all, the full guide table (every row marked as a guide).
 */
export function dryingGoalTableRows(
  readings: ReadonlyArray<ReferenceCandidate>,
): DryingGoalTableRow[] {
  const references = pickReferenceReadings(readings);
  const rows: DryingGoalTableRow[] = Object.entries(references).map(([material, target]) => ({
    material,
    target,
    basis: "reference" as const,
  }));
  const seen = new Set(Object.keys(references));
  for (const r of readings) {
    if (!isProgressReading(r) || !isMoistureContentUnit(r.unit)) continue;
    const key = materialKey(r.surfaceType);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ material: key, target: getDryStandard(key).dryThreshold, basis: "guide" });
  }
  if (rows.length === 0) {
    return MOISTURE_GUIDE_VALUES.map((g) => ({ material: g.label, target: g.dryThreshold, basis: "guide" as const }));
  }
  return rows;
}

// ── Plain-English wording for messages, certificates and reports ─────────────

/** Says what the goals were measured against, without naming any standard. */
export function dryingGoalBasisText(bases: ReadonlyArray<DryingGoalBasis>): string {
  const ref = bases.includes("reference");
  const guide = bases.includes("guide");
  if (ref && !guide) return "the job's reference readings from unaffected like material";
  if (ref && guide)
    return "the job's reference readings where recorded, and starting guide values (not a standard) for materials without one";
  return "starting guide values only (not a standard); no reference reading was recorded";
}

export function dryingGoalProgressMessage(failingCount: number): string {
  return `${failingCount} reading(s) still above their drying goal. Continue drying.`;
}

export function dryingGoalAchievedMessage(
  readingCount: number,
  totalDryingDays: number,
  bases: ReadonlyArray<DryingGoalBasis>,
): string {
  return `All ${readingCount} moisture readings are at or below their drying goal, measured against ${dryingGoalBasisText(bases)}. Drying complete in ${totalDryingDays} day(s).`;
}

export function dryingGoalCertificate(
  achievedAtIso: string | undefined,
  totalDryingDays: number | null | undefined,
  bases: ReadonlyArray<DryingGoalBasis>,
): string {
  return `Drying Goal: ACHIEVED — ${achievedAtIso ?? "date not recorded"} — All materials at or below their drying goal, measured against ${dryingGoalBasisText(bases)} — ${totalDryingDays ?? "?"} day(s) drying`;
}

/** Short form of the basis, for badges and labels. Names no standard. */
export const DRYING_GOAL_BASIS_SHORT = "Goal: reference reading, else guide";

/** Neutral value written to new DryingGoalRecord rows in place of a standard citation. */
export const DRYING_GOAL_BASIS_RECORD =
  "Reference reading from unaffected like material where recorded; otherwise starting guide value (not a standard)";

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
