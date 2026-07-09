/**
 * Parse a numeric reading typed into a form input (temperature, humidity,
 * moisture, dimensions). RA-7019.
 *
 * Returns the exact finite number for valid input and `null` for empty or
 * unparseable input — "not recorded", which callers must keep distinct from a
 * real `0`. Uses `Number()` (whole-string) rather than `parseFloat()`, which
 * silently truncates partial input ("12abc" -> 12); on an insurer-facing report
 * that silent transform is a data-integrity defect. Empty/whitespace is handled
 * before `Number()` because `Number("")` is `0`, not `NaN`.
 */
export function parseReadingInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
