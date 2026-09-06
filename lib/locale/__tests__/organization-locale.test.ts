import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  businessIdentifierLabel,
  isSupportedCountry,
  isTimezoneForCountry,
} from "../organization-locale";

describe("organization locale", () => {
  it("supports Australia and New Zealand only", () => {
    expect(isSupportedCountry("AU")).toBe(true);
    expect(isSupportedCountry("NZ")).toBe(true);
    expect(isSupportedCountry("US")).toBe(false);
  });

  it("keeps timezones inside their jurisdiction", () => {
    expect(isTimezoneForCountry("AU", "Australia/Brisbane")).toBe(true);
    expect(isTimezoneForCountry("NZ", "Pacific/Auckland")).toBe(true);
    expect(isTimezoneForCountry("NZ", "Australia/Sydney")).toBe(false);
  });

  it("provides jurisdiction-appropriate defaults and labels", () => {
    expect(DEFAULT_ORGANIZATION_TIMEZONE.AU).toBe("Australia/Sydney");
    expect(DEFAULT_ORGANIZATION_TIMEZONE.NZ).toBe("Pacific/Auckland");
    expect(businessIdentifierLabel("AU")).toBe("ABN");
    expect(businessIdentifierLabel("NZ")).toBe("NZBN");
  });
});
