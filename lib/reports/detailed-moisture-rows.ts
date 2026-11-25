/**
 * Moisture table for the detailed (initial assessment) report PDF —
 * a follow-up to RA-8548.
 *
 * This is an insurer-facing table, so every cell must come from a saved
 * reading, read through the shared reader (`./saved-readings`):
 *
 *  - No saved readings → no rows, and the PDF says plainly that no moisture
 *    readings were recorded.
 *  - Scope data (structure, materials) is not a reading and builds no rows.
 *  - No padding rows. The table has exactly one row per saved reading.
 *  - A reading saved without a dry standard prints "Not recorded". No
 *    benchmark, target or percentage is assumed.
 *  - The unit printed is the saved unit. A reading saved without a unit
 *    prints its value alone.
 */

import { readSavedReadings, type SavedMoistureReading } from "./saved-readings";

export const DETAILED_MOISTURE_NOT_RECORDED = "Not recorded";

export const DETAILED_NO_MOISTURE_READINGS =
  "No moisture readings were recorded for this job.";

export interface DetailedMoistureColumn {
  label: string;
  width: number;
}

/** Column headings name what is saved. None implies a unit. */
export const DETAILED_MOISTURE_COLUMNS: DetailedMoistureColumn[] = [
  { label: "Location", width: 115 },
  { label: "Material", width: 105 },
  { label: "Reading", width: 85 },
  { label: "Depth", width: 75 },
  { label: "Dry standard", width: 110 },
];

export interface DetailedMoistureRow {
  location: string;
  material: string;
  reading: string;
  depth: string;
  dryStandard: string;
}

export interface DetailedMoistureTableInput {
  /** Report.moistureReadings — JSON string, array or NIR envelope. */
  moistureReadings?: unknown;
  /** Report.tier2Responses — JSON string or parsed object. */
  tier2?: unknown;
  /**
   * Scope data. Accepted so the route can pass it, but deliberately ignored:
   * scope structure or materials are not saved readings.
   */
  scope?: unknown;
}

export interface DetailedMoistureTable {
  rows: DetailedMoistureRow[];
  /** Tier 2 free-text moisture answers, printed verbatim under the table. */
  notes: string[];
  /** The plain statement printed when nothing was saved; otherwise `null`. */
  emptyMessage: string | null;
}

/** Saved unit codes (MoistureReading.unit) as printed. Unknown codes print verbatim. */
const UNIT_LABELS: Record<string, string> = {
  PERCENT_MC: "% MC",
  WME: "WME",
  RH: "% RH",
  CELSIUS: "C",
};

function row(reading: SavedMoistureReading): DetailedMoistureRow {
  const unit = reading.unit ? (UNIT_LABELS[reading.unit] ?? reading.unit) : "";
  return {
    location: reading.location ?? DETAILED_MOISTURE_NOT_RECORDED,
    material: reading.material ?? DETAILED_MOISTURE_NOT_RECORDED,
    reading: unit ? `${reading.value} ${unit}` : reading.value,
    depth: reading.depth ?? DETAILED_MOISTURE_NOT_RECORDED,
    dryStandard: reading.dryStandard ?? DETAILED_MOISTURE_NOT_RECORDED,
  };
}

export function buildDetailedMoistureTable(
  input: DetailedMoistureTableInput,
): DetailedMoistureTable {
  const saved = readSavedReadings({
    moistureReadings: input.moistureReadings,
    tier2: input.tier2,
  });
  const rows = saved.moisture.map(row);
  const notes = saved.moistureNotes;
  return {
    rows,
    notes,
    emptyMessage:
      rows.length === 0 && notes.length === 0
        ? DETAILED_NO_MOISTURE_READINGS
        : null,
  };
}

/** The cells of a row, in column order. */
export function detailedMoistureCells(r: DetailedMoistureRow): string[] {
  return [r.location, r.material, r.reading, r.depth, r.dryStandard];
}
