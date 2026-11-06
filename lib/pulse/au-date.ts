/**
 * Date-only key in Australia/Sydney. The once-per-day Pulse guarantees are keyed
 * to the AU-local calendar day (matching the AU-timezone-scheduled cron and its
 * AU homeowner audience), not UTC midnight.
 */
export function auDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(now);
}
