/**
 * RA-1300 — safe date parsing for user-supplied body values.
 *
 * `new Date("not-a-date")` returns an Invalid Date that Prisma may
 * persist as NULL or store ambiguously; downstream `.toLocaleString()`
 * calls render "Invalid Date" on customer-facing reports or throw 500
 * at PDF export time.
 *
 * parseValidDate(raw) returns:
 *   - a valid Date if `raw` parses cleanly (string or Date)
 *   - null if `raw` is null / undefined / empty string
 *   - the sentinel `INVALID` symbol if `raw` is present but unparseable
 *
 * Callers should check for INVALID and return 400 to the client.
 * null passes through as "no value provided" which routes can treat as
 * "use default" or "no update" depending on context.
 */

export const INVALID_DATE = Symbol("INVALID_DATE");
export type ParsedDate = Date | null | typeof INVALID_DATE;

export function parseValidDate(raw: unknown): ParsedDate {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? INVALID_DATE : raw;
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? INVALID_DATE : d;
  }
  return INVALID_DATE;
}

/**
 * Convenience: returns a 400 response shape if the parse failed.
 * Caller does:
 *   const parsed = parseValidDate(body.inspectionDate);
 *   if (parsed === INVALID_DATE) return NextResponse.json(..., 400);
 *   // parsed is Date | null here
 */
export function isInvalidDate(parsed: ParsedDate): boolean {
  return parsed === INVALID_DATE;
}
