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

/** The guide row for a material (falls back to "other"). */
export function getDryStandard(material: string): DryStandard {
  return (
    MOISTURE_GUIDE_VALUES.find((s) => s.material === material) ??
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

export interface ReferenceCandidate {
  surfaceType?: string | null;
  moistureLevel?: number | null;
  isBaseline?: boolean | null;
  unit?: string | null;
  invalidatedAt?: Date | string | null;
  recordedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/** Material key used to match a reference reading to a monitored reading. */
export function materialKey(surfaceType: string | null | undefined): string {
  return (surfaceType ?? "").trim().toLowerCase();
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
 * Relative-humidity and other non-MC readings are never used.
 */
export function pickReferenceReadings(
  readings: ReadonlyArray<ReferenceCandidate>,
): Record<string, number> {
  const newest = new Map<string, { mc: number; at: number }>();
  for (const r of readings) {
    if (!r.isBaseline || r.invalidatedAt) continue;
    if (r.unit && r.unit !== "PERCENT_MC") continue;
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
 * otherwise the stored target (a guide snapshot) or the guide value.
 */
export function resolveDryingGoal(
  material: string,
  references: Record<string, number> = {},
  storedTarget?: number | null,
): DryingGoal {
  const ref = references[materialKey(material)];
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
  for (const r of readings) {
    const goal = resolveDryingGoal(r.surfaceType, references, storedTargets[r.surfaceType]);
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
