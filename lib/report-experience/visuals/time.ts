/**
 * RA-8107: the one owner of calendar-day maths for the report visuals.
 *
 * A job is run in one place, so every day shown to a reader is the day in the
 * report's own IANA time zone, never the viewer's and never UTC. A timestamp
 * with no offset is ambiguous (it could be any zone), so it is refused rather
 * than guessed: callers treat a null result as "no usable date".
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const MS_PER_DAY = 86_400_000;

/** Throws RangeError for an unknown zone, so a typo never silently becomes UTC. */
export function assertTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-AU", { timeZone });
}

function validDateOnly(value: string): string | null {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
  return real ? value : null;
}

/** Calendar date (YYYY-MM-DD) of an instant, or a date-only value, in `timeZone`. */
export function toLocalDate(value: unknown, timeZone: string): string | null {
  if (typeof value !== "string") return null;
  const dateOnly = validDateOnly(value);
  if (dateOnly) return dateOnly;
  if (!HAS_OFFSET.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD value. */
export function dayNumber(localDate: string): number {
  const m = DATE_ONLY.exec(localDate);
  if (!m) throw new Error("Invalid local date");
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

export function addDays(localDate: string, days: number): string {
  return new Date((dayNumber(localDate) + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Human date, for example "3 Mar 2026". Takes a YYYY-MM-DD value. */
export function formatLocalDate(localDate: string): string {
  const m = DATE_ONLY.exec(localDate);
  if (!m) return localDate;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  );
}

/** Human date and time with the zone name, for provenance labels. */
export function formatInstant(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || !HAS_OFFSET.test(iso)) return "time not recorded";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}
