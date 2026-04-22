/**
 * RA-1300 — safe date parsing for user-supplied strings.
 *
 * `new Date("anything")` returns an `Invalid Date` for malformed input,
 * which then silently persists as NULL (best case) or an actual Invalid
 * Date via Prisma (the original bug). This helper returns `null` on
 * any input that's not a parseable ISO-8601 / Date-constructor-accepted
 * string. Callers should check for null and return a 400.
 *
 * Usage:
 *   const inspectionDate = parseInspectionDate(body.inspectionDate);
 *   if (body.inspectionDate !== undefined && inspectionDate === null) {
 *     return NextResponse.json({ error: "Invalid inspectionDate" }, { status: 400 });
 *   }
 */

/**
 * Parse a user-supplied date string into a `Date`, returning `null` on
 * malformed / out-of-range input. Accepts:
 *   - ISO-8601 strings ("2026-04-21", "2026-04-21T10:30:00Z")
 *   - RFC-2822 strings ("21 Apr 2026")
 *   - Date instances (passed through)
 *   - `undefined` / `null` → `null` (caller decides if that's valid)
 *
 * Rejects:
 *   - Empty string (treated as missing, returns `null`)
 *   - "Invalid Date", "NaN", other non-parseable
 *   - Dates before 1970 or after 2100 (heuristic against typos like
 *     "0026-04-21" — two-digit year fat-fingers)
 */
export function parseDate(
  input: string | Date | null | undefined,
): Date | null {
  if (input === null || input === undefined) return null;

  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }

  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const d = new Date(trimmed);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;

  // Guard against obvious typos (e.g. two-digit year fat-fingers that
  // become year 0026) and far-future garbage.
  const year = d.getFullYear();
  if (year < 1970 || year > 2100) return null;

  return d;
}

/**
 * Convenience wrapper with a more specific name for the common case
 * (inspection / completion / submission dates). Semantically identical
 * to `parseDate`; exists so call sites read clearly.
 */
export const parseInspectionDate = parseDate;
export const parseCompletionDate = parseDate;

/** Sentinel — callers use this if they want to distinguish "not supplied" from "invalid". */
export const INVALID_DATE = Symbol("INVALID_DATE");
