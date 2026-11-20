/**
 * Cost library CSV export and import, both through the shared cell owner in
 * `./csv-cell` so a file exported from the cost libraries page imports back
 * unchanged (RA-8401).
 */
import { parseCsv, toCsv, unguardCsvCell } from "./csv-cell";

export interface CostLibraryCsvItem {
  category?: string | null;
  description?: string | null;
  unit?: string | null;
  rate?: number | null;
}

export const COST_LIBRARY_CSV_HEADERS = [
  "category",
  "description",
  "unit",
  "rate",
] as const;

/** The cost libraries list page export: category, description, unit, rate. */
export function costLibraryItemsToCsv(
  items: readonly CostLibraryCsvItem[],
): string {
  return toCsv([
    [...COST_LIBRARY_CSV_HEADERS],
    ...items.map((item) => [
      item.category ?? "",
      item.description ?? "",
      item.unit ?? "",
      item.rate ?? "",
    ]),
  ]);
}

/**
 * Read a cost library CSV. The first row is the header (case-insensitive).
 * Each data row becomes a record keyed by header; `rate` is a number (0 when
 * unreadable). Returns null when there is no header plus at least one row.
 */
export function parseCostLibraryCsv(
  text: string,
): Record<string, string | number>[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cols) => {
    const item: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      // Text cells are kept exactly as written; only header names are
      // trimmed, and parseFloat ignores spaces around the rate.
      item[h] = unguardCsvCell(cols[i] ?? "");
    });
    if (item.rate !== undefined) {
      item.rate = parseFloat(String(item.rate)) || 0;
    }
    return item;
  });
}
