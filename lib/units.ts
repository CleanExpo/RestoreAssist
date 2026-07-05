/**
 * Unit conversion helpers — RA-7001.
 *
 * m² is the canonical affected-area unit across RestoreAssist. The legacy
 * `affectedSquareFootage` column (sq ft) is deprecated and retained only for
 * the internal IICRC scoring engine + un-backfilled legacy rows until a
 * follow-up drops it (two-step rename per CLAUDE.md rule 16).
 */

/** Exact conversion: 1 square foot = 0.09290304 square metres. */
export const SQFT_TO_SQM = 0.09290304;

export function sqftToSqm(sqft: number): number {
  return sqft * SQFT_TO_SQM;
}

export function sqmToSqft(sqm: number): number {
  return sqm / SQFT_TO_SQM;
}

/**
 * Canonical affected area in m² for a row that may carry either the new
 * `affectedAreaSqm` column or only the legacy `affectedSquareFootage` (sq ft).
 * Prefers the metric column; falls back to converting the legacy value so
 * un-backfilled / legacy rows never break during the transition.
 */
export function resolveAreaSqm(area: {
  affectedAreaSqm?: number | null;
  affectedSquareFootage?: number | null;
}): number {
  if (area.affectedAreaSqm != null) return area.affectedAreaSqm;
  if (area.affectedSquareFootage != null) {
    return area.affectedSquareFootage * SQFT_TO_SQM;
  }
  return 0;
}

/**
 * Dual-write derivation for the AffectedArea create path (RA-7001).
 * m² is canonical; the deprecated sq-ft column is kept consistent so the
 * internal IICRC engine and un-migrated readers keep working. Accepts either
 * an m² input (`affectedAreaSqm`, metric-native clients) or a legacy sq-ft
 * input (`affectedSquareFootage`), and returns both columns. Returns null when
 * neither input is a finite positive number so the caller can reject it.
 */
export function deriveAreaColumns(input: {
  affectedAreaSqm?: unknown;
  affectedSquareFootage?: unknown;
}): { affectedAreaSqm: number; affectedSquareFootage: number } | null {
  let sqm: number;
  if (input.affectedAreaSqm !== undefined && input.affectedAreaSqm !== null) {
    sqm = Number(input.affectedAreaSqm);
  } else {
    sqm = Number(input.affectedSquareFootage) * SQFT_TO_SQM;
  }
  if (!isFinite(sqm) || sqm <= 0) return null;
  return { affectedAreaSqm: sqm, affectedSquareFootage: sqmToSqft(sqm) };
}
