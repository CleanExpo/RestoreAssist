/**
 * RA-8547 — moisture rows for the forensic report PDF.
 *
 * This is an insurer-facing table, so every cell must come from a saved
 * reading. The builder never invents a row, a dry standard or a WET/DRY
 * verdict:
 *
 *  - No saved readings → no rows. The PDF then says no readings were recorded.
 *  - AI scope areas (`area.moisture`) are not saved readings and build no rows.
 *  - A reading saved without a dry standard prints "Not recorded".
 *    (A per-material target can replace this once RA-8508 settles a single
 *    owner for dry targets — until then, nothing is assumed.)
 *  - A status is printed only when the saved record has one. Nothing is
 *    derived from the reading's value.
 */

export const MOISTURE_NOT_RECORDED = "Not recorded";

export interface ForensicMoistureRow {
  location: string;
  material: string;
  reading: string;
  dryStandard: string;
  /** The saved status, verbatim. `null` when the record has none. */
  status: string | null;
}

export interface ForensicMoistureRowsInput {
  /** `report.moistureReadings` — JSON string or array. */
  moistureReadings?: unknown;
  /** `tier2.T2_Q1_moistureReadings` — when an array, it replaces the above. */
  tier2Readings?: unknown;
  /**
   * AI scope areas. Accepted so callers can pass them, but deliberately
   * ignored: a scope-area moisture figure is not a saved reading.
   */
  scopeAreas?: unknown;
}

type Rec = Record<string, unknown>;

function firstPresent(rec: Rec, keys: string[]): string | null {
  for (const key of keys) {
    const value = rec[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) return String(value);
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
  }
  return null;
}

function toRow(raw: unknown): ForensicMoistureRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Rec;
  return {
    location: firstPresent(rec, ["location", "room"]) ?? MOISTURE_NOT_RECORDED,
    material:
      firstPresent(rec, ["material", "surfaceType"]) ?? MOISTURE_NOT_RECORDED,
    reading:
      firstPresent(rec, [
        "reading",
        "moistureContent",
        "wme",
        "moistureLevel",
      ]) ?? MOISTURE_NOT_RECORDED,
    dryStandard:
      firstPresent(rec, ["dryStandard", "benchmark"]) ?? MOISTURE_NOT_RECORDED,
    status: firstPresent(rec, ["status"]),
  };
}

function parseSaved(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function buildForensicMoistureRows(
  input: ForensicMoistureRowsInput,
): ForensicMoistureRow[] {
  // Same precedence as before RA-8547: a tier2 readings array, when present,
  // replaces report.moistureReadings.
  const saved = Array.isArray(input.tier2Readings)
    ? input.tier2Readings
    : parseSaved(input.moistureReadings);

  return saved
    .map(toRow)
    .filter((row): row is ForensicMoistureRow => row !== null);
}
