import { describe, it, expect } from "vitest";
import { getLocale, getCurrency, formatMoney, formatDate } from "../format";

describe("getLocale", () => {
  it("returns en-AU for AU", () => {
    expect(getLocale("AU")).toBe("en-AU");
  });

  it("returns en-NZ for NZ", () => {
    expect(getLocale("NZ")).toBe("en-NZ");
  });
});

describe("getCurrency", () => {
  it("returns AUD for AU", () => {
    expect(getCurrency("AU")).toBe("AUD");
  });

  it("returns NZD for NZ", () => {
    expect(getCurrency("NZ")).toBe("NZD");
  });
});

describe("formatMoney", () => {
  it("formats AUD correctly for AU", () => {
    const result = formatMoney(15000, "AU");
    expect(result).toContain("150");
    expect(result).toContain("$");
  });

  it("formats NZD correctly for NZ", () => {
    const result = formatMoney(15000, "NZ");
    expect(result).toContain("150");
    // NZD formatting includes $ sign
    expect(result).toContain("$");
  });
});

describe("formatDate", () => {
  const testDate = new Date("2026-04-17T00:00:00Z");

  it("formats date in AU locale", () => {
    const result = formatDate(testDate, "AU");
    // en-AU medium date: "17 Apr 2026"
    expect(result).toMatch(/17/);
    expect(result).toMatch(/2026/);
  });

  it("formats date in NZ locale", () => {
    const result = formatDate(testDate, "NZ");
    // en-NZ medium date: "17 Apr 2026"
    expect(result).toMatch(/17/);
    expect(result).toMatch(/2026/);
  });
});
