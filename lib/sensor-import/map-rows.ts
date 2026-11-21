/**
 * RA-8413 Stage 1: turns parsed rows into reading candidates, or says why not.
 *
 * Pure: no file, database or network access, and the only clock is the `now`
 * the caller passes in. Nothing is written anywhere; a later stage decides
 * what to do with the candidates.
 *
 * Rules that matter to a caller:
 * - Candidate text is ALREADY SANITISED (HTML stripped, entities encoded). Do
 *   not sanitise it again before storing it, or it will be encoded twice.
 * - Nothing is guessed or cut. A row that cannot be read with certainty is
 *   listed in `rejected` with one reason; text over its limit is refused, not
 *   shortened; a blank number is missing, never zero.
 * - Every row of the file appears exactly once, in `candidates` or `rejected`.
 * - `outcome: "none_importable"` means the file produced nothing. Treat it as a
 *   refusal, not as an empty success.
 */
import { sanitizeString } from "@/lib/sanitize";

import {
  isValidatedMapping,
  type MoistureDepth,
  type MoistureUnit,
  type TemperatureUnit,
  type TextSource,
  type TimestampFormat,
  type ValidatedMapping,
} from "./mapping";
import type { ParsedSensorCsv } from "./parse-sensor-csv";

export type RowRefusalCode =
  | "timestamp_unparseable"
  | "timestamp_ambiguous_or_missing_local_time"
  | "timestamp_in_future"
  | "timestamp_too_old"
  | "value_missing"
  | "value_not_a_number"
  | "value_out_of_range"
  | "location_empty"
  | "text_unsafe"
  | "text_too_long"
  | "duplicate_in_file";

export type RejectedRow = {
  /** 1-based physical line the row starts on. */
  line: number;
  reason: RowRefusalCode;
  /** 0-based header position of the cell at fault, when one cell is. Never the header text. */
  column?: number;
};

type CandidateBase = {
  line: number;
  /** ISO-8601 instant in UTC with milliseconds and a trailing Z. */
  recordedAt: string;
  /** Already sanitised. Do not sanitise again. */
  location: string;
  /** Already sanitised. Do not sanitise again. */
  deviceVendor: string;
  /** The vendor, lower-cased, for comparing vendors typed differently. */
  deviceVendorKey: string;
  /** Already sanitised. Null when the mapping names no model. */
  deviceModel: string | null;
  /** Already sanitised. Absent when the mapping names no id column or the cell is blank. */
  deviceId?: string;
};

export type MoistureCandidate = CandidateBase & {
  kind: "moisture";
  /** Already sanitised. Do not sanitise again. */
  surfaceType: string;
  depth: MoistureDepth;
  /** In `unit`, exactly as the file gave it. Moisture units are never converted. */
  moistureLevel: number;
  unit: MoistureUnit;
};

export type AmbientCandidate = CandidateBase & {
  kind: "ambient";
  /** Degrees Celsius. Converted from Fahrenheit when the file is in Fahrenheit, rounded to 0.01. */
  ambientTemperatureC: number;
  /** Relative humidity, percent. */
  humidityLevel: number;
  /** Degrees Celsius, converted and rounded as the temperature is. Absent when the cell is blank. */
  dewPointC?: number;
  /** The unit the file's temperatures were in before conversion. */
  temperatureUnitInFile: TemperatureUnit;
};

export type SensorCandidate = MoistureCandidate | AmbientCandidate;

export type MapRowsOutcome = "all_importable" | "partial" | "none_importable";

export type MapRowsSuccess = {
  ok: true;
  candidates: SensorCandidate[];
  rejected: RejectedRow[];
  counts: { total: number; importable: number; rejected: number };
  rejectedByReason: Partial<Record<RowRefusalCode, number>>;
  outcome: MapRowsOutcome;
};

/**
 * The whole file is refused when a day/month format is declared the wrong way
 * round: a row fails the declared order but reads cleanly with day and month
 * swapped. Without this, the rows that happen to fit would import with wrong dates.
 */
export type MapRowsRefusal = { ok: false; code: "date_order_conflict"; line: number };

export type MapRowsResult = MapRowsSuccess | MapRowsRefusal;

export const SENSOR_ROW_LIMITS = {
  locationLength: 200,
  surfaceTypeLength: 100,
  deviceTextLength: 100,
  moisture: { min: 0, max: 100 },
  humidity: { min: 0, max: 100 },
  temperatureC: { min: -20, max: 55 },
  dewPointC: { min: -60, max: 55 },
  /** A reading may be this far ahead of `now` before it counts as in the future. */
  futureToleranceMs: 5 * 60 * 1000,
  earliestMs: Date.UTC(2000, 0, 1),
} as const;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;
const YEAR_FIRST = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
const SLASHED = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
const EPOCH_SECONDS = /^\d{1,10}$/;
const EPOCH_MILLISECONDS = /^\d{1,13}$/;

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isRealWallTime(wall: Wall): boolean {
  return (
    wall.month >= 1 &&
    wall.month <= 12 &&
    wall.day >= 1 &&
    wall.day <= daysInMonth(wall.year, wall.month) &&
    wall.hour <= 23 &&
    wall.minute <= 59 &&
    wall.second <= 59
  );
}

/** The wall-clock fields read as if they were UTC. Not an instant until a zone or offset is applied. */
function wallAsUtc(wall: Wall): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** How far the zone's wall clock is ahead of UTC at this instant, in milliseconds. */
function zoneOffsetAt(timeZone: string, instantMs: number): number {
  const fields: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(instantMs)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  const wall = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  return wall - instantMs;
}

/**
 * The one instant at which the zone's wall clock showed this time, or null when
 * the time never happened (clocks went forward) or happened twice (clocks went
 * back). Uses only the declared zone, never the zone of the machine.
 */
function resolveInZone(wallUtcMs: number, timeZone: string): number | null {
  const offsets = new Set([
    zoneOffsetAt(timeZone, wallUtcMs - DAY_MS),
    zoneOffsetAt(timeZone, wallUtcMs),
    zoneOffsetAt(timeZone, wallUtcMs + DAY_MS),
  ]);
  let found: number | null = null;
  let count = 0;
  for (const offset of offsets) {
    const instant = wallUtcMs - offset;
    if (zoneOffsetAt(timeZone, instant) === offset) {
      found = instant;
      count++;
    }
  }
  return count === 1 ? found : null;
}

type TimeResult =
  | { kind: "instant"; ms: number }
  | { kind: "refused"; reason: "timestamp_unparseable" | "timestamp_ambiguous_or_missing_local_time" }
  | { kind: "date_order_conflict" };

const UNPARSEABLE: TimeResult = { kind: "refused", reason: "timestamp_unparseable" };

function inZone(wall: Wall, timeZone: string | undefined, extraMs: number): TimeResult {
  if (timeZone === undefined) return UNPARSEABLE;
  const instant = resolveInZone(wallAsUtc(wall), timeZone);
  if (instant === null) return { kind: "refused", reason: "timestamp_ambiguous_or_missing_local_time" };
  return { kind: "instant", ms: instant + extraMs };
}

function readTimestamp(cell: string, format: TimestampFormat, timeZone: string | undefined): TimeResult {
  const text = cell.trim();

  if (format === "epoch_s") {
    return EPOCH_SECONDS.test(text) ? { kind: "instant", ms: Number(text) * 1000 } : UNPARSEABLE;
  }
  if (format === "epoch_ms") {
    return EPOCH_MILLISECONDS.test(text) ? { kind: "instant", ms: Number(text) } : UNPARSEABLE;
  }

  if (format === "iso") {
    const match = ISO.exec(text);
    if (match === null) return UNPARSEABLE;
    const wall: Wall = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: match[6] === undefined ? 0 : Number(match[6]),
    };
    if (!isRealWallTime(wall)) return UNPARSEABLE;
    // Fractions finer than a millisecond are cut, not rounded.
    const fractionMs = match[7] === undefined ? 0 : Number(match[7].padEnd(3, "0").slice(0, 3));
    const zone = match[8];
    if (zone === undefined) return inZone(wall, timeZone, fractionMs);
    if (zone === "Z") return { kind: "instant", ms: wallAsUtc(wall) + fractionMs };
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(4, 6));
    if (hours > 14 || minutes > 59) return UNPARSEABLE;
    const offsetMs = (zone.startsWith("-") ? -1 : 1) * (hours * 60 + minutes) * 60 * 1000;
    return { kind: "instant", ms: wallAsUtc(wall) - offsetMs + fractionMs };
  }

  if (format === "yyyy-MM-dd HH:mm[:ss]") {
    const match = YEAR_FIRST.exec(text);
    if (match === null) return UNPARSEABLE;
    const wall: Wall = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: match[6] === undefined ? 0 : Number(match[6]),
    };
    return isRealWallTime(wall) ? inZone(wall, timeZone, 0) : UNPARSEABLE;
  }

  const match = SLASHED.exec(text);
  if (match === null) return UNPARSEABLE;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const dayFirst = format === "dd/MM/yyyy HH:mm[:ss]";
  const rest = {
    year: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
  };
  const declared: Wall = { ...rest, day: dayFirst ? first : second, month: dayFirst ? second : first };
  if (isRealWallTime(declared)) return inZone(declared, timeZone, 0);
  const swapped: Wall = { ...rest, day: declared.month, month: declared.day };
  return isRealWallTime(swapped) ? { kind: "date_order_conflict" } : UNPARSEABLE;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const PLAIN_NUMBER = /^-?\d{1,6}(?:\.\d{1,6})?$/;

type NumberResult = { ok: true; value: number } | { ok: false; reason: "value_missing" | "value_not_a_number" };

/** Plain decimals only: no exponent, hex, thousands separator, decimal comma or leading plus. */
function readNumber(cell: string): NumberResult {
  const text = cell.trim();
  if (text === "") return { ok: false, reason: "value_missing" };
  if (!PLAIN_NUMBER.test(text)) return { ok: false, reason: "value_not_a_number" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "value_not_a_number" };
  return { ok: true, value: value === 0 ? 0 : value };
}

function toCelsius(value: number, unit: TemperatureUnit): number {
  if (unit === "C") return value;
  const celsius = Math.round((((value - 32) * 5) / 9) * 100) / 100;
  return celsius === 0 ? 0 : celsius;
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const AFTER_SIGN_BLOCKERS = /[=(|!*/^]/;

// RA-8474: invisible format characters (Unicode Cf: zero-width space, byte-order
// mark, joiners, soft hyphen) render as nothing, so a value that starts with
// them is judged by what follows. Such a value is refused, never stripped.
const LEADING_FORMAT_CHARS = /^\p{Cf}+/u;

/** True when a spreadsheet would treat the value as a formula if it were ever exported and opened. */
function isFormulaLeading(raw: string): boolean {
  const value = raw.replace(LEADING_FORMAT_CHARS, "");
  if (value.length === 0) return false;
  const first = value.charAt(0);
  if (first === "=" || first === "@" || first === "\t" || first === "\r") return true;
  if (first === "+" || first === "-") {
    const next = value.charAt(1);
    const ordinary = (next >= "0" && next <= "9") || next === " ";
    return !ordinary || AFTER_SIGN_BLOCKERS.test(value);
  }
  return false;
}

type TextResult = { ok: true; value: string } | { ok: false; reason: "text_unsafe" | "text_too_long" };

/**
 * The single owner of the text rule. The guard runs on the raw value (so a
 * leading tab or carriage return is seen) and again on the sanitised value the
 * candidate will hold (so markup cannot hide a formula). Over-long text is
 * refused, never cut.
 */
function cleanText(raw: string, limit: number): TextResult {
  if (isFormulaLeading(raw)) return { ok: false, reason: "text_unsafe" };
  const clean = sanitizeString(raw);
  if (isFormulaLeading(clean)) return { ok: false, reason: "text_unsafe" };
  if (clean.length > limit) return { ok: false, reason: "text_too_long" };
  return { ok: true, value: clean };
}

type Fault = { reason: RowRefusalCode; column?: number };
type Resolved = { ok: true; value: string } | { ok: false; fault: Fault };

/** Reads a constant once. An empty result is reported with `emptyReason`. */
function cleanConstant(raw: string, limit: number, emptyReason: RowRefusalCode): Resolved {
  const text = cleanText(raw, limit);
  if (!text.ok) return { ok: false, fault: { reason: text.reason } };
  if (text.value === "") return { ok: false, fault: { reason: emptyReason } };
  return { ok: true, value: text.value };
}

function cleanCell(cells: string[], index: number, limit: number, emptyReason: RowRefusalCode): Resolved {
  const text = cleanText(cells[index], limit);
  if (!text.ok) return { ok: false, fault: { reason: text.reason, column: index } };
  if (text.value === "") return { ok: false, fault: { reason: emptyReason, column: index } };
  return { ok: true, value: text.value };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function sameHeader(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

export function mapRows(
  parsed: ParsedSensorCsv,
  mapping: ValidatedMapping,
  options: { now: Date },
): MapRowsResult {
  if (!isValidatedMapping(mapping)) {
    throw new TypeError("mapRows needs the mapping object that validateMapping returned");
  }
  if (!sameHeader(parsed.header, mapping.header)) {
    throw new TypeError("mapRows was given a mapping that was checked against a different header");
  }
  const nowMs = options.now.getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("mapRows needs a valid `now`");

  const limits = SENSOR_ROW_LIMITS;
  const { timestamp, device, moisture, ambient } = mapping;

  // Values that are the same for every row are read once. A fault in one of them refuses every row.
  const constantFaults: Fault[] = [];
  const constant = (source: TextSource | string, limit: number, emptyReason: RowRefusalCode): string | null => {
    const raw = typeof source === "string" ? source : "value" in source ? source.value : null;
    if (raw === null) return null;
    const resolved = cleanConstant(raw, limit, emptyReason);
    if (resolved.ok) return resolved.value;
    constantFaults.push(resolved.fault);
    return null;
  };
  const vendor = constant(device.vendor, limits.deviceTextLength, "value_missing");
  const model = device.model === undefined ? null : constant(device.model, limits.deviceTextLength, "value_missing");
  const constantLocation = constant(mapping.location, limits.locationLength, "location_empty");
  const constantSurface =
    moisture === undefined ? null : constant(moisture.surfaceType, limits.surfaceTypeLength, "value_missing");
  const vendorKey = vendor === null ? "" : vendor.toLowerCase();
  const constantFault: Fault | undefined = constantFaults[0];

  const candidates: SensorCandidate[] = [];
  const rejected: RejectedRow[] = [];
  const rejectedByReason: Partial<Record<RowRefusalCode, number>> = {};
  const seenKeys = new Set<string>();

  const reject = (line: number, fault: Fault): void => {
    rejected.push(fault.column === undefined ? { line, reason: fault.reason } : { line, ...fault });
    rejectedByReason[fault.reason] = (rejectedByReason[fault.reason] ?? 0) + 1;
  };

  for (const row of parsed.rows) {
    const { line, cells } = row;

    const time = readTimestamp(cells[timestamp.index], timestamp.format, timestamp.timeZone);
    if (time.kind === "date_order_conflict") return { ok: false, code: "date_order_conflict", line };

    if (constantFault !== undefined || vendor === null) {
      reject(line, constantFault ?? { reason: "value_missing" });
      continue;
    }

    if (time.kind === "refused") {
      reject(line, { reason: time.reason, column: timestamp.index });
      continue;
    }
    if (time.ms < limits.earliestMs) {
      reject(line, { reason: "timestamp_too_old", column: timestamp.index });
      continue;
    }
    if (time.ms > nowMs + limits.futureToleranceMs) {
      reject(line, { reason: "timestamp_in_future", column: timestamp.index });
      continue;
    }

    let location: string;
    if ("index" in mapping.location) {
      const resolved = cleanCell(cells, mapping.location.index, limits.locationLength, "location_empty");
      if (!resolved.ok) {
        reject(line, resolved.fault);
        continue;
      }
      location = resolved.value;
    } else {
      location = constantLocation ?? "";
    }

    // A blank device id cell is "no id", not a fault.
    let deviceId: string | undefined;
    if (device.idIndex !== undefined && cells[device.idIndex].trim() !== "") {
      const text = cleanText(cells[device.idIndex], limits.deviceTextLength);
      if (!text.ok) {
        reject(line, { reason: text.reason, column: device.idIndex });
        continue;
      }
      if (text.value !== "") deviceId = text.value;
    }

    const base = {
      line,
      recordedAt: new Date(time.ms).toISOString(),
      location,
      deviceVendor: vendor,
      deviceVendorKey: vendorKey,
      deviceModel: model,
    };

    if (moisture !== undefined) {
      let surfaceType: string;
      if ("index" in moisture.surfaceType) {
        const resolved = cleanCell(cells, moisture.surfaceType.index, limits.surfaceTypeLength, "value_missing");
        if (!resolved.ok) {
          reject(line, resolved.fault);
          continue;
        }
        surfaceType = resolved.value;
      } else {
        surfaceType = constantSurface ?? "";
      }

      const level = readNumber(cells[moisture.valueIndex]);
      if (!level.ok) {
        reject(line, { reason: level.reason, column: moisture.valueIndex });
        continue;
      }
      if (!inRange(level.value, limits.moisture)) {
        reject(line, { reason: "value_out_of_range", column: moisture.valueIndex });
        continue;
      }

      const key = JSON.stringify([
        vendorKey,
        deviceId ?? "",
        location.toLowerCase(),
        surfaceType,
        moisture.depth,
        time.ms,
      ]);
      if (seenKeys.has(key)) {
        reject(line, { reason: "duplicate_in_file" });
        continue;
      }
      seenKeys.add(key);

      candidates.push({
        kind: "moisture",
        ...base,
        surfaceType,
        depth: moisture.depth,
        moistureLevel: level.value,
        unit: moisture.unit,
        ...(deviceId === undefined ? {} : { deviceId }),
      });
      continue;
    }

    if (ambient === undefined) {
      // validateMapping guarantees one of the two blocks; this keeps the row accounted for if that ever changes.
      reject(line, { reason: "value_missing" });
      continue;
    }

    const temperature = readNumber(cells[ambient.temperatureIndex]);
    if (!temperature.ok) {
      reject(line, { reason: temperature.reason, column: ambient.temperatureIndex });
      continue;
    }
    const temperatureC = toCelsius(temperature.value, ambient.temperatureUnit);
    if (!inRange(temperatureC, limits.temperatureC)) {
      reject(line, { reason: "value_out_of_range", column: ambient.temperatureIndex });
      continue;
    }

    const humidity = readNumber(cells[ambient.humidityIndex]);
    if (!humidity.ok) {
      reject(line, { reason: humidity.reason, column: ambient.humidityIndex });
      continue;
    }
    if (!inRange(humidity.value, limits.humidity)) {
      reject(line, { reason: "value_out_of_range", column: ambient.humidityIndex });
      continue;
    }

    let dewPointC: number | undefined;
    if (ambient.dewPointIndex !== undefined && cells[ambient.dewPointIndex].trim() !== "") {
      const dewPoint = readNumber(cells[ambient.dewPointIndex]);
      if (!dewPoint.ok) {
        reject(line, { reason: dewPoint.reason, column: ambient.dewPointIndex });
        continue;
      }
      dewPointC = toCelsius(dewPoint.value, ambient.temperatureUnit);
      if (!inRange(dewPointC, limits.dewPointC)) {
        reject(line, { reason: "value_out_of_range", column: ambient.dewPointIndex });
        continue;
      }
    }

    const key = JSON.stringify([vendorKey, deviceId ?? "", location.toLowerCase(), time.ms]);
    if (seenKeys.has(key)) {
      reject(line, { reason: "duplicate_in_file" });
      continue;
    }
    seenKeys.add(key);

    candidates.push({
      kind: "ambient",
      ...base,
      ambientTemperatureC: temperatureC,
      humidityLevel: humidity.value,
      ...(dewPointC === undefined ? {} : { dewPointC }),
      temperatureUnitInFile: ambient.temperatureUnit,
      ...(deviceId === undefined ? {} : { deviceId }),
    });
  }

  const counts = { total: parsed.rows.length, importable: candidates.length, rejected: rejected.length };
  const outcome: MapRowsOutcome =
    counts.rejected === 0 ? "all_importable" : counts.importable === 0 ? "none_importable" : "partial";

  return { ok: true, candidates, rejected, counts, rejectedByReason, outcome };
}
