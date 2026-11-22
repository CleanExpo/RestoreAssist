/**
 * RA-8107: deterministic moisture time series for the report trend charts.
 *
 * Readings are stored values only. This file never interpolates, averages or
 * converts between units (a WME value is not turned into g/kg or the reverse),
 * and it never states a dry date unless a stored reading at or below a stated
 * target is the evidence. Anything it cannot show safely it says it cannot.
 */
import { addDays, assertTimeZone, dayNumber, toLocalDate } from "./time";

export type MoistureUnit = "WME" | "RH_PERCENT" | "G_PER_KG" | "CELSIUS";

export type MoistureInputReading = Readonly<{
  id: string;
  roomId: string;
  /** An instant with an offset. */
  observedAt: string;
  value: number;
  unit: MoistureUnit;
}>;

export type MoisturePoint = Readonly<{ id: string; observedAt: string; localDate: string; value: number }>;

export type MoistureTableRow = Readonly<{
  id: string;
  localDate: string;
  observedAt: string;
  value: number;
  /** Two different values were stored for the same instant; neither is plotted. */
  conflict: boolean;
}>;

export type DryEvidence =
  | Readonly<{ state: "evidenced"; date: string; readingId: string; target: number }>
  | Readonly<{ state: "no-date"; reason: "above-target" | "no-target" | "no-readings"; target: number | null }>
  | Readonly<{ state: "not-applicable" }>;

export type MoistureSeries = Readonly<{
  roomId: string;
  roomLabel: string;
  unit: MoistureUnit;
  points: readonly MoisturePoint[];
  table: readonly MoistureTableRow[];
  /** Local days between the first and last reading with no reading at all. */
  missingDays: readonly string[];
  repeatsCollapsed: number;
  conflicts: readonly Readonly<{ observedAt: string; values: readonly number[] }>[];
  dry: DryEvidence;
  stall: boolean;
}>;

export type MoistureOptions = Readonly<{
  timeZone: string;
  /** Drying goal per unit, from the job record. Only WME is compared with a goal. */
  targets: Readonly<Partial<Record<MoistureUnit, number>>>;
  roomLabels?: Readonly<Record<string, string>>;
}>;

/** Visits above target that must show less than this fall before a stall is flagged. */
const STALL_VISITS = 3;
const STALL_MIN_FALL = 0.05;
const DRY_GOAL_UNITS: readonly MoistureUnit[] = ["WME"];

function validTarget(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function dryEvidence(unit: MoistureUnit, points: readonly MoisturePoint[], rawTarget: number | undefined): DryEvidence {
  if (!DRY_GOAL_UNITS.includes(unit)) return { state: "not-applicable" };
  const target = validTarget(rawTarget);
  if (target === null) return { state: "no-date", reason: "no-target", target: null };
  if (points.length === 0) return { state: "no-date", reason: "no-readings", target };
  const latest = points[points.length - 1];
  if (latest.value > target) return { state: "no-date", reason: "above-target", target };
  // First reading of the final unbroken run at or below target.
  let first = points.length - 1;
  while (first > 0 && points[first - 1].value <= target) first--;
  return { state: "evidenced", date: points[first].localDate, readingId: points[first].id, target };
}

function isStalled(unit: MoistureUnit, points: readonly MoisturePoint[], rawTarget: number | undefined): boolean {
  const target = validTarget(rawTarget);
  if (!DRY_GOAL_UNITS.includes(unit) || target === null || points.length < STALL_VISITS) return false;
  const recent = points.slice(-STALL_VISITS);
  if (!recent.every((p) => p.value > target)) return false;
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  return (first - last) / first < STALL_MIN_FALL;
}

export function buildMoistureSeries(readings: readonly MoistureInputReading[], options: MoistureOptions): MoistureSeries[] {
  assertTimeZone(options.timeZone);
  const groups = new Map<string, MoistureInputReading[]>();
  for (const reading of readings) {
    if (!Number.isFinite(reading.value)) throw new Error(`Reading ${reading.id} has no finite value`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(reading.observedAt) || toLocalDate(reading.observedAt, options.timeZone) === null) {
      throw new Error(`Reading ${reading.id} needs a time with an offset`);
    }
    const key = `${reading.roomId}\u0000${reading.unit}`;
    const list = groups.get(key);
    if (list) list.push(reading);
    else groups.set(key, [reading]);
  }

  const series: MoistureSeries[] = [];
  for (const group of groups.values()) {
    const { roomId, unit } = group[0];
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

    // Same instant: identical values collapse, differing values are a conflict.
    const byInstant = new Map<number, MoistureInputReading[]>();
    for (const reading of sorted) {
      const ms = Date.parse(reading.observedAt);
      const bucket = byInstant.get(ms);
      if (bucket) bucket.push(reading);
      else byInstant.set(ms, [reading]);
    }

    const points: MoisturePoint[] = [];
    const table: MoistureTableRow[] = [];
    const conflicts: { observedAt: string; values: number[] }[] = [];
    const days = new Set<string>();
    let repeatsCollapsed = 0;
    for (const bucket of byInstant.values()) {
      const localDate = toLocalDate(bucket[0].observedAt, options.timeZone)!;
      days.add(localDate);
      const distinct = new Set(bucket.map((b) => b.value));
      if (distinct.size > 1) {
        conflicts.push({ observedAt: bucket[0].observedAt, values: bucket.map((b) => b.value) });
        for (const b of bucket) table.push({ id: b.id, localDate, observedAt: b.observedAt, value: b.value, conflict: true });
        continue;
      }
      repeatsCollapsed += bucket.length - 1;
      const kept = bucket[0];
      points.push({ id: kept.id, observedAt: kept.observedAt, localDate, value: kept.value });
      table.push({ id: kept.id, localDate, observedAt: kept.observedAt, value: kept.value, conflict: false });
    }

    const ordered = [...days].sort();
    const missingDays: string[] = [];
    if (ordered.length > 1) {
      const span = dayNumber(ordered[ordered.length - 1]) - dayNumber(ordered[0]);
      for (let i = 1; i < span; i++) {
        const day = addDays(ordered[0], i);
        if (!days.has(day)) missingDays.push(day);
      }
    }

    series.push({
      roomId,
      roomLabel: options.roomLabels?.[roomId] ?? roomId,
      unit,
      points,
      table,
      missingDays,
      repeatsCollapsed,
      conflicts,
      dry: dryEvidence(unit, points, options.targets[unit]),
      stall: isStalled(unit, points, options.targets[unit]),
    });
  }
  return series.sort((a, b) => a.roomLabel.localeCompare(b.roomLabel) || a.unit.localeCompare(b.unit));
}
