import type { Country } from "@/lib/gst-rules";

export const SUPPORTED_COUNTRIES = [
  "AU",
  "NZ",
] as const satisfies readonly Country[];

export const ORGANIZATION_TIMEZONES = {
  AU: [
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Brisbane",
    "Australia/Adelaide",
    "Australia/Perth",
    "Australia/Darwin",
    "Australia/Hobart",
    "Australia/Lord_Howe",
  ],
  NZ: ["Pacific/Auckland", "Pacific/Chatham"],
} as const satisfies Record<Country, readonly string[]>;

export const DEFAULT_ORGANIZATION_TIMEZONE: Record<Country, string> = {
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
};

export function isSupportedCountry(value: unknown): value is Country {
  return (
    typeof value === "string" && SUPPORTED_COUNTRIES.includes(value as Country)
  );
}

export function isTimezoneForCountry(
  country: Country,
  timezone: unknown,
): timezone is string {
  return (
    typeof timezone === "string" &&
    (ORGANIZATION_TIMEZONES[country] as readonly string[]).includes(timezone)
  );
}

export function businessIdentifierLabel(country: Country): "ABN" | "NZBN" {
  return country === "NZ" ? "NZBN" : "ABN";
}
