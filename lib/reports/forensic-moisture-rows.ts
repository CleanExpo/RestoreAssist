/**
 * RA-8547 — moisture rows for the forensic report PDF.
 * RA-8548 — rows now come from the shared reader (`./saved-readings`).
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

import {
  readSavedReadings,
  type SavedMoistureReading,
  type SavedPsychrometricReading,
} from "./saved-readings";

export const MOISTURE_NOT_RECORDED = "Not recorded";

export interface ForensicMoistureRow {
  location: string;
  material: string;
  reading: string;
  dryStandard: string;
  /** The saved status, verbatim. `null` when the record has none. */
  status: string | null;
}

export interface ForensicPsychrometricRow {
  location: string;
  temperature: string;
  humidity: string;
  gpp: string;
  dewPoint: string;
}

export interface ForensicMoistureRowsInput {
  /** `report.moistureReadings` — JSON string, array or NIR envelope. */
  moistureReadings?: unknown;
  /**
   * `tier2.T2_Q1_moistureReadings` alone. Kept for callers that pass only
   * the answer; `tier2` (the whole answer set) is preferred.
   */
  tier2Readings?: unknown;
  /** Report.tier2Responses — JSON string or parsed object. */
  tier2?: unknown;
  /**
   * AI scope areas. Accepted so callers can pass them, but deliberately
   * ignored: a scope-area moisture figure is not a saved reading.
   */
  scopeAreas?: unknown;
}

export interface ForensicReadingsInput extends ForensicMoistureRowsInput {
  /** `report.psychrometricReadings` — JSON string or array. */
  psychrometricReadings?: unknown;
  /** The saved psychrometric assessment — JSON string or object. */
  psychrometricAssessment?: unknown;
}

export interface ForensicReadings {
  moistureRows: ForensicMoistureRow[];
  /** Tier 2 free-text moisture answers, printed verbatim beside the table. */
  moistureNotes: string[];
  psychrometricRows: ForensicPsychrometricRow[];
}

/** Saved unit codes (MoistureReading.unit) as printed. Unknown codes print verbatim. */
const UNIT_LABELS: Record<string, string> = {
  PERCENT_MC: "% MC",
  WME: "WME",
  RH: "% RH",
  CELSIUS: "C",
};

function moistureRow(reading: SavedMoistureReading): ForensicMoistureRow {
  const unit = reading.unit ? (UNIT_LABELS[reading.unit] ?? reading.unit) : "";
  return {
    location: reading.location ?? MOISTURE_NOT_RECORDED,
    material: reading.material ?? MOISTURE_NOT_RECORDED,
    reading: unit ? `${reading.value} ${unit}` : reading.value,
    dryStandard: reading.dryStandard ?? MOISTURE_NOT_RECORDED,
    status: reading.status,
  };
}

function psychrometricRow(
  reading: SavedPsychrometricReading,
): ForensicPsychrometricRow {
  return {
    location: reading.location ?? MOISTURE_NOT_RECORDED,
    temperature: reading.temperature ?? MOISTURE_NOT_RECORDED,
    humidity: reading.humidity ?? MOISTURE_NOT_RECORDED,
    gpp: reading.gpp ?? MOISTURE_NOT_RECORDED,
    dewPoint: reading.dewPoint ?? MOISTURE_NOT_RECORDED,
  };
}

function tier2Of(input: ForensicMoistureRowsInput): unknown {
  if (input.tier2 !== undefined && input.tier2 !== null) return input.tier2;
  if (input.tier2Readings === undefined) return undefined;
  return { T2_Q1_moistureReadings: input.tier2Readings };
}

/**
 * RA-8548 — every saved reading the forensic PDF prints, read through the
 * shared saved-readings reader. No generator-side field guessing.
 */
export function buildForensicReadings(
  input: ForensicReadingsInput,
): ForensicReadings {
  const saved = readSavedReadings({
    moistureReadings: input.moistureReadings,
    psychrometricReadings: input.psychrometricReadings,
    psychrometricAssessment: input.psychrometricAssessment,
    tier2: tier2Of(input),
  });
  return {
    moistureRows: saved.moisture.map(moistureRow),
    moistureNotes: saved.moistureNotes,
    psychrometricRows: saved.psychrometric.map(psychrometricRow),
  };
}

export function buildForensicMoistureRows(
  input: ForensicMoistureRowsInput,
): ForensicMoistureRow[] {
  return buildForensicReadings(input).moistureRows;
}

/**
 * RA-8547 follow-up — the forensic PDF's moisture table has a fixed space on
 * page 3, so it shows at most this many rows. Any further saved reading must
 * be declared, never dropped silently.
 */
export const FORENSIC_MOISTURE_TABLE_MAX_ROWS = 5;

/**
 * Plain note for saved readings the table could not show. `null` when every
 * reading was shown.
 */
export function moistureRowsNotShownNote(notShown: number): string | null {
  if (!Number.isInteger(notShown) || notShown <= 0) return null;
  return notShown === 1
    ? "1 further saved moisture reading is not shown in this table."
    : `${notShown} further saved moisture readings are not shown in this table.`;
}

/** RA-8548 — the psychrometric table shows at most this many rows. */
export const FORENSIC_PSYCHROMETRIC_TABLE_MAX_ROWS = 3;

/** Plain note for saved psychrometric readings the table could not show. */
export function psychrometricRowsNotShownNote(notShown: number): string | null {
  if (!Number.isInteger(notShown) || notShown <= 0) return null;
  return notShown === 1
    ? "1 further saved psychrometric reading is not shown in this table."
    : `${notShown} further saved psychrometric readings are not shown in this table.`;
}

/**
 * RA-8548 — the tier 2 free-text moisture answer is printed beside the
 * table, never dropped. A long answer is cut to `maxLines` and the cut is
 * declared.
 */
export function moistureNotesLines(
  notes: string[],
  wrap: (text: string) => string[],
  maxLines: number,
): string[] {
  const lines = notes.flatMap((note) => wrap(note.replace(/\s+/g, " ")));
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(0, maxLines - 1));
  return [
    ...kept,
    "The recorded moisture notes continue in the saved tier 2 answer.",
  ];
}
