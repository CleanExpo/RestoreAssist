/**
 * Normalise a free-text date string to YYYY-MM-DD format.
 *
 * Extracted from components/InitialDataEntryForm.tsx during RA-512 refactor.
 * Handles DD/MM/YYYY, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YY (with 2-digit year
 * pivot at 1950) and falls back to JS `Date` parsing as a last resort.
 * Returns empty string when parsing fails completely.
 *
 * Pure function — no I/O, no side effects, safe to unit test.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";

  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse various date formats
  const formats = [
    /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2})/, // DD/MM/YY or DD-MM-YY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year: string, month: string, day: string;

      if (match[3].length === 4) {
        // Full year
        if (format === formats[0]) {
          // DD/MM/YYYY
          day = match[1].padStart(2, "0");
          month = match[2].padStart(2, "0");
          year = match[3];
        } else {
          // YYYY/MM/DD
          year = match[1];
          month = match[2].padStart(2, "0");
          day = match[3].padStart(2, "0");
        }
      } else {
        // 2-digit year
        day = match[1].padStart(2, "0");
        month = match[2].padStart(2, "0");
        const twoDigitYear = parseInt(match[3]);
        year = twoDigitYear > 50 ? `19${match[3]}` : `20${match[3]}`;
      }

      return `${year}-${month}-${day}`;
    }
  }

  // If we can't parse it, try using Date object
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch {
    // Ignore parsing errors
  }

  return "";
}
