/**
 * RA-8548 — the one reader for saved moisture and psychrometric readings.
 *
 * Readings are saved in several shapes by different writers. Report
 * generators call `readSavedReadings` and never read raw reading fields
 * themselves. The writer map (each shape this module knows) is:
 *
 *  Moisture
 *  - NIR envelope `{ moistureReadings, affectedAreas, scopeItems, photos }`
 *    in Report.moistureReadings (reports/initial-entry, reports/[id]/nir-data,
 *    prisma/seed-demo-inspection.ts). Items: location, surfaceType,
 *    moistureLevel, depth (+ readingDate, instrument, status in the seed).
 *  - Bare array in Report.moistureReadings (POST/PUT /api/reports from
 *    MonitoringVerificationProcedures): location, material, moistureContent,
 *    targetLevel, timestamp, notes.
 *  - Tier 2 answer T2_Q1_moistureReadings (components/Tier2Questions.tsx):
 *    free text. An older array form is still read as rows.
 *  - Relational MoistureReading rows (inspections/[id]/moisture,
 *    draft-snapshot, evidence, live-teacher take-reading, seeds): location,
 *    surfaceType, moistureLevel, depth, unit, isBaseline, isMonitoringPoint,
 *    recordedAt, invalidatedAt.
 *  - Aliases seen in derived shapes: value, wme, reading, room.
 *
 *  Psychrometric
 *  - Report.psychrometricAssessment (reports/[id]/equipment, initial-entry,
 *    seed): temperature, humidity, dewPoint, grainsPoundDry — plus metadata
 *    that is NOT a reading: waterClass, systemType, dryingPotential,
 *    grainsTarget.
 *  - Report.psychrometricReadings array: MonitoringVerificationProcedures
 *    (location, temperature, humidity, timestamp) and prisma/seed-demo.ts
 *    (indoorTempC, indoorRH, dewPointC, outdoorRH, grainsPP, date).
 *  - Relational EnvironmentalData rows: ambientTemperature, humidityLevel,
 *    dewPoint, gpp, grainsPerPound, location, recordedAt.
 *  - Relational PsychrometricReading rows: dryBulbTempC, relativeHumidity,
 *    dewPointC, grainsPerPound, visitDate.
 *
 * Rules: values are returned verbatim as saved. Nothing is derived — no dry
 * standard, threshold, status or target is invented. A record with no
 * measured value is not a reading. Invalidated relational readings are not
 * current readings.
 */

export type SavedReadingSource =
  | "report"
  | "tier2"
  | "relational"
  | "assessment";

export interface SavedMoistureReading {
  source: SavedReadingSource;
  location: string | null;
  material: string | null;
  /** The measured value, verbatim (a saved 0 is "0"). */
  value: string;
  /** Saved unit, verbatim (e.g. "WME", "PERCENT_MC"). */
  unit: string | null;
  depth: string | null;
  /** Saved dry standard (dryStandard / benchmark) only. Never derived. */
  dryStandard: string | null;
  /** A saved target level (monitoring form). Not a dry standard. */
  savedTarget: string | null;
  /** Saved status, verbatim. Never derived from the value. */
  status: string | null;
  recordedAt: string | null;
  isBaseline: boolean | null;
  isMonitoringPoint: boolean | null;
}

export interface SavedPsychrometricReading {
  source: SavedReadingSource;
  location: string | null;
  temperature: string | null;
  humidity: string | null;
  gpp: string | null;
  dewPoint: string | null;
  outdoorHumidity: string | null;
  recordedAt: string | null;
}

export interface SavedReadings {
  moisture: SavedMoistureReading[];
  psychrometric: SavedPsychrometricReading[];
  /** Tier 2 free-text moisture answers, verbatim (trimmed). */
  moistureNotes: string[];
  /** True only when no reading and no moisture note was saved anywhere. */
  noneRecorded: boolean;
}

export interface SavedReadingsInput {
  /** Report.moistureReadings — JSON string, array or NIR envelope. */
  moistureReadings?: unknown;
  /** Report.psychrometricReadings — JSON string or array. */
  psychrometricReadings?: unknown;
  /** Report.psychrometricAssessment — JSON string or object. */
  psychrometricAssessment?: unknown;
  /** Report.tier2Responses — JSON string or parsed object. */
  tier2?: unknown;
  /** Relational MoistureReading rows. */
  moistureReadingRows?: unknown;
  /** Relational EnvironmentalData rows. */
  environmentalDataRows?: unknown;
  /** Relational PsychrometricReading rows. */
  psychrometricReadingRows?: unknown;
}

type Rec = Record<string, unknown>;

const MOISTURE_VALUE_KEYS = [
  "reading",
  "moistureContent",
  "moistureLevel",
  "value",
  "wme",
];
const LOCATION_KEYS = ["location", "room", "roomZoneId"];
const MATERIAL_KEYS = ["material", "surfaceType", "materialType"];
const DATE_KEYS = [
  "recordedAt",
  "readingDate",
  "date",
  "timestamp",
  "visitDate",
];

const TEMPERATURE_KEYS = [
  "temperature",
  "indoorTempC",
  "ambientTemperature",
  "dryBulbTempC",
];
const HUMIDITY_KEYS = [
  "humidity",
  "indoorRH",
  "humidityLevel",
  "relativeHumidity",
];
const GPP_KEYS = ["gpp", "grainsPP", "grainsPoundDry", "grainsPerPound"];
const DEW_POINT_KEYS = ["dewPoint", "dewPointC"];
const OUTDOOR_HUMIDITY_KEYS = ["outdoorRH"];

function isRec(value: unknown): value is Rec {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

function firstPresent(rec: Rec, keys: string[]): string | null {
  for (const key of keys) {
    const found = text(rec[key]);
    if (found !== null) return found;
  }
  return null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Report.moistureReadings: a bare array, or the NIR envelope. */
function reportMoistureItems(raw: unknown): unknown[] {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) return parsed;
  if (isRec(parsed)) return asArray(parsed.moistureReadings);
  return [];
}

function isInvalidated(rec: Rec): boolean {
  return rec.invalidatedAt !== null && rec.invalidatedAt !== undefined;
}

function toMoisture(
  raw: unknown,
  source: SavedReadingSource,
): SavedMoistureReading | null {
  if (!isRec(raw) || isInvalidated(raw)) return null;
  const value = firstPresent(raw, MOISTURE_VALUE_KEYS);
  if (value === null) return null;
  return {
    source,
    location: firstPresent(raw, LOCATION_KEYS),
    material: firstPresent(raw, MATERIAL_KEYS),
    value,
    unit: firstPresent(raw, ["unit"]),
    depth: firstPresent(raw, ["depth"]),
    dryStandard: firstPresent(raw, ["dryStandard", "benchmark"]),
    savedTarget: firstPresent(raw, ["targetLevel"]),
    status: firstPresent(raw, ["status"]),
    recordedAt: firstPresent(raw, DATE_KEYS),
    isBaseline: flag(raw.isBaseline),
    isMonitoringPoint: flag(raw.isMonitoringPoint),
  };
}

function toPsychrometric(
  raw: unknown,
  source: SavedReadingSource,
): SavedPsychrometricReading | null {
  if (!isRec(raw) || isInvalidated(raw)) return null;
  const reading: SavedPsychrometricReading = {
    source,
    location: firstPresent(raw, ["location", "room", "chamber"]),
    temperature: firstPresent(raw, TEMPERATURE_KEYS),
    humidity: firstPresent(raw, HUMIDITY_KEYS),
    gpp: firstPresent(raw, GPP_KEYS),
    dewPoint: firstPresent(raw, DEW_POINT_KEYS),
    outdoorHumidity: firstPresent(raw, OUTDOOR_HUMIDITY_KEYS),
    recordedAt: firstPresent(raw, DATE_KEYS),
  };
  const measured =
    reading.temperature ??
    reading.humidity ??
    reading.gpp ??
    reading.dewPoint ??
    reading.outdoorHumidity;
  return measured === null ? null : reading;
}

function compact<T>(items: Array<T | null>): T[] {
  return items.filter((item): item is T => item !== null);
}

export function readSavedReadings(input: SavedReadingsInput): SavedReadings {
  const tier2 = parseJson(input.tier2);
  const tier2Answer = isRec(tier2) ? tier2.T2_Q1_moistureReadings : undefined;

  // Moisture rows. An older tier 2 array (no current writer) keeps its
  // pre-RA-8548 precedence: it replaces the report's JSON rows, so the same
  // readings are not printed twice.
  const jsonMoisture = Array.isArray(tier2Answer)
    ? compact(tier2Answer.map((r) => toMoisture(r, "tier2")))
    : compact(
        reportMoistureItems(input.moistureReadings).map((r) =>
          toMoisture(r, "report"),
        ),
      );
  const relationalMoisture = compact(
    asArray(input.moistureReadingRows).map((r) => toMoisture(r, "relational")),
  );
  const moisture = [...jsonMoisture, ...relationalMoisture];

  const note = text(tier2Answer);
  const moistureNotes = note === null ? [] : [note];

  const assessment = parseJson(input.psychrometricAssessment);
  const psychrometric = compact([
    ...asArray(parseJson(input.psychrometricReadings)).map((r) =>
      toPsychrometric(r, "report"),
    ),
    toPsychrometric(assessment, "assessment"),
    ...asArray(input.environmentalDataRows).map((r) =>
      toPsychrometric(r, "relational"),
    ),
    ...asArray(input.psychrometricReadingRows).map((r) =>
      toPsychrometric(r, "relational"),
    ),
  ]);

  return {
    moisture,
    psychrometric,
    moistureNotes,
    noneRecorded:
      moisture.length === 0 &&
      psychrometric.length === 0 &&
      moistureNotes.length === 0,
  };
}
