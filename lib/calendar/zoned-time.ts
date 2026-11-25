/**
 * RA-8497. Wall-clock times in an organisation's timezone.
 *
 * The office books a visit by typing a date and times. Those are read in the
 * organisation's timezone (Organization.timezone), never the browser's or the
 * server's, so an office worker travelling, or a server running in UTC, books
 * the same instant. Every Intl call names its timeZone explicitly.
 */
import { getLocale, type Country } from "@/lib/locale/format";

/** Organization.timezone's schema default. */
export const DEFAULT_TIME_ZONE = "Australia/Sydney";

/** A valid IANA zone, or the default. Intl throws RangeError on a bad zone. */
export function resolveTimeZone(value: string | null | undefined): string {
  const zone = value?.trim();
  // Intl accepts some bare names ("UTC", "GMT"); an organisation's zone is
  // always Area/Location.
  if (!zone || !zone.includes("/")) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock reading of an instant in a zone. */
export function wallClockAt(instant: Date, timeZone: string): WallClock {
  let fmt = partFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, fmt);
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
  const w = wallClockAt(new Date(instant), timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The instant at which a zone's clocks read the given date ("YYYY-MM-DD")
 * and time ("HH:MM"), or null when either is malformed or impossible.
 *
 * A time skipped or repeated at a daylight-time changeover (between 2 am and
 * 3 am on two Sundays a year) resolves to an instant within an hour of it.
 */
export function zonedWallClockToInstant(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  const d = DATE_PATTERN.exec(date);
  const t = TIME_PATTERN.exec(time);
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(guess);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  // The two readings differ only around a changeover.
  return new Date(Math.min(first, second));
}

/** "Thursday 15 January 2026, 9:00 am to 11:30 am AEDT" in the zone. */
export function formatVisitWindow(
  start: Date,
  end: Date,
  timeZone: string,
  country: Country,
): string {
  const locale = getLocale(country);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const clock = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const zoneName =
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
      .formatToParts(start)
      .find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  const dayText = (d: Date) => day.format(d).replace(/,/g, "");
  const endText =
    dayText(start) === dayText(end)
      ? clock.format(end)
      : `${dayText(end)}, ${clock.format(end)}`;
  return `${dayText(start)}, ${clock.format(start)} to ${endText} ${zoneName}`;
}
