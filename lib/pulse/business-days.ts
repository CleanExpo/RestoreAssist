/**
 * Business-day (Mon–Fri) counter for the 20-business-day Code of Practice
 * update trigger (RA-6951, epic RA-6948 — General Insurance Code of Practice
 * mandates a client update at least every 20 business days).
 *
 * Public holidays are NOT modelled: no AU public-holiday calendar exists
 * elsewhere in this repo (grep-checked), and state-by-state holiday calendars
 * shift year to year. Treating every weekday as a business day is a
 * conservative under-count of the true gap (it can only make the trigger
 * fire SLIGHTLY later than a holiday-aware calendar would), which is the
 * safe direction for a compliance-cadence guarantee.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Counts weekdays strictly after `start` up to and including `end`. Dates are
 * compared at UTC day granularity so callers don't need to normalise
 * timestamps themselves.
 */
export function countBusinessDaysBetween(start: Date, end: Date): number {
  const startDay = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endDay = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  if (endDay <= startDay) return 0;

  let count = 0;
  for (let day = startDay + MS_PER_DAY; day <= endDay; day += MS_PER_DAY) {
    const dow = new Date(day).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
