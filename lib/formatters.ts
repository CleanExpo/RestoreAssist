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

const DASH = "—";

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

/** Accept Date | ISO string | null. Returns dd/mm/yyyy. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** dd/mm/yyyy hh:mm (24h) in AEST. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Compact relative time — "2m ago", "3h ago", "yesterday", then date. */
export function formatRelative(value: Date | string | null | undefined): string {
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
