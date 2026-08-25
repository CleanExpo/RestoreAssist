/**
 * RA-1120: Locale and currency helpers for AU/NZ multi-tenant support.
 *
 * Usage:
 *   import { formatMoney, formatDate } from "@/lib/locale/format";
 *   formatMoney(15000, org.country) // "$150.00" (AU) or "NZ$150.00" (NZ)
 */

export type Country = "AU" | "NZ";

export function getLocale(country: Country): string {
  return country === "NZ" ? "en-NZ" : "en-AU";
}

export function getCurrency(country: Country): "AUD" | "NZD" {
  return country === "NZ" ? "NZD" : "AUD";
}

export function formatMoney(cents: number, country: Country): string {
  return new Intl.NumberFormat(getLocale(country), {
    style: "currency",
    currency: getCurrency(country),
  }).format(cents / 100);
}

export function formatDate(date: Date, country: Country): string {
  return new Intl.DateTimeFormat(getLocale(country), {
    dateStyle: "medium",
    // Date-only values represent the tenant's local calendar date. Keep the
    // result stable across server/container timezones (and avoid UTC midnight
    // rolling back to the previous day in North American runtimes).
    timeZone: country === "NZ" ? "Pacific/Auckland" : "Australia/Sydney",
  }).format(date);
}
