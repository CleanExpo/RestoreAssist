/**
 * RA-1563 — canonical AU-locale formatters.
 *
 * The codebase had 226 inline `toLocaleDateString()` / `.toFixed(2)`
 * / `Intl.NumberFormat` calls with drifting locale, rounding, and
 * currency symbol behaviour. These helpers pin the AU defaults so
 * every surface shows dd/mm/yyyy dates and $A currency with cents.
 *
 * All helpers are intentionally total — they accept null/undefined
 * and return an em-dash so callers don't need sentinel checks.
 */

import { getLocale, getTimeZone, type Country } from "@/lib/locale/format";

const DASH = "—";

/**
 * RA-8384: every date helper names its zone. Without `timeZone` the text
 * follows the machine's own zone — UTC on the server — so an invoice made at
 * 08:00 Brisbane on 3 Nov printed "02 Nov". Dates picked from a calendar are
 * stored as UTC midnight, which is still the same day in any AU/NZ zone.
 */
export interface DateFormatOptions {
  /** Tenant country; picks the locale and calendar zone. Defaults to AU. */
  country?: Country;
  /** "2-digit" → 03/11/2026, "short" → 03 Nov 2026, "long" → 03 November 2026. */
  month?: "2-digit" | "short" | "long";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prices are stored in cents across the codebase. Convert + format. */
export function formatCurrencyCents(
  cents: number | null | undefined,
  { withSymbol = true }: { withSymbol?: boolean } = {},
): string {
  if (cents == null || Number.isNaN(cents)) return DASH;
  const dollars = cents / 100;
  const formatter = new Intl.NumberFormat("en-AU", {
    style: withSymbol ? "currency" : "decimal",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(dollars);
}

/** Accept Date | ISO string | null. Returns dd/mm/yyyy in the tenant's zone. */
export function formatDate(
  value: Date | string | null | undefined,
  { country = "AU", month = "2-digit" }: DateFormatOptions = {},
): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleDateString(getLocale(country), {
    day: "2-digit",
    month,
    year: "numeric",
    timeZone: getTimeZone(country),
  });
}

/** dd/mm/yyyy hh:mm (24h) in the tenant's zone (Sydney by default). */
export function formatDateTime(
  value: Date | string | null | undefined,
  { country = "AU" }: Pick<DateFormatOptions, "country"> = {},
): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleString(getLocale(country), {
    timeZone: getTimeZone(country),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Compact relative time — "2m ago", "3h ago", "yesterday", then date. */
export function formatRelative(
  value: Date | string | null | undefined,
): string {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172_800) return "yesterday";
  return formatDate(d);
}

export function formatPercent(
  fraction: number | null | undefined,
  { digits = 0 }: { digits?: number } = {},
): string {
  if (fraction == null || Number.isNaN(fraction)) return DASH;
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Canonical integer formatter with AU thousand separators. */
export function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return DASH;
  return new Intl.NumberFormat("en-AU").format(Math.round(n));
}
