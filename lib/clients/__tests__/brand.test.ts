/**
 * P1 #10 — client co-brand validator tests.
 *
 * Covers:
 *   - hex validation (accept 6-char, reject shorthand / rgba / non-hex)
 *   - URL validation (accept https, reject http / relative / malformed)
 *   - `resolveClientBrandTheme` fallback behaviour
 *   - `hexToRgb` parsing
 */

import { describe, expect, it } from "vitest";
import {
  brandPrimaryColorSchema,
  brandLogoUrlSchema,
  resolveClientBrandTheme,
  resolveOrgBrandTheme,
  hexToRgb,
  RA_DEFAULT_PRIMARY_COLOR,
  RA_DEFAULT_LOGO_URL,
} from "@/lib/clients/brand";

describe("brandPrimaryColorSchema", () => {
  it("accepts valid 6-char hex with leading #", () => {
    expect(brandPrimaryColorSchema.safeParse("#1C2E47").success).toBe(true);
    expect(brandPrimaryColorSchema.safeParse("#ffffff").success).toBe(true);
    expect(brandPrimaryColorSchema.safeParse("#000000").success).toBe(true);
  });

  it("rejects 3-char hex shorthand", () => {
    expect(brandPrimaryColorSchema.safeParse("#1C2").success).toBe(false);
  });

  it("rejects rgba / rgb / named colors", () => {
    expect(brandPrimaryColorSchema.safeParse("rgba(0,0,0,1)").success).toBe(false);
    expect(brandPrimaryColorSchema.safeParse("rgb(28,46,71)").success).toBe(false);
    expect(brandPrimaryColorSchema.safeParse("navy").success).toBe(false);
  });

  it("rejects hex without leading #", () => {
    expect(brandPrimaryColorSchema.safeParse("1C2E47").success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(brandPrimaryColorSchema.safeParse("#GGGGGG").success).toBe(false);
  });
});

describe("brandLogoUrlSchema", () => {
  it("accepts HTTPS URLs", () => {
    expect(
      brandLogoUrlSchema.safeParse("https://cdn.example.com/logo.png").success,
    ).toBe(true);
  });

  it("rejects HTTP URLs", () => {
    expect(
      brandLogoUrlSchema.safeParse("http://cdn.example.com/logo.png").success,
    ).toBe(false);
  });

  it("rejects relative URLs", () => {
    expect(brandLogoUrlSchema.safeParse("/logos/client.png").success).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(brandLogoUrlSchema.safeParse("not-a-url").success).toBe(false);
  });
});

describe("resolveClientBrandTheme", () => {
  it("uses RA defaults when client is null", () => {
    expect(resolveClientBrandTheme(null)).toEqual({
      logoUrl: RA_DEFAULT_LOGO_URL,
      primaryColor: RA_DEFAULT_PRIMARY_COLOR,
    });
  });

  it("uses RA defaults when both fields are null", () => {
    expect(
      resolveClientBrandTheme({
        brandLogoUrl: null,
        brandPrimaryColor: null,
      }),
    ).toEqual({
      logoUrl: RA_DEFAULT_LOGO_URL,
      primaryColor: RA_DEFAULT_PRIMARY_COLOR,
    });
  });

  it("returns client values when both are present", () => {
    expect(
      resolveClientBrandTheme({
        brandLogoUrl: "https://cdn.example.com/acme.png",
        brandPrimaryColor: "#FF6600",
      }),
    ).toEqual({
      logoUrl: "https://cdn.example.com/acme.png",
      primaryColor: "#FF6600",
    });
  });

  it("falls back per-field when one is null", () => {
    expect(
      resolveClientBrandTheme({
        brandLogoUrl: null,
        brandPrimaryColor: "#FF6600",
      }),
    ).toEqual({
      logoUrl: RA_DEFAULT_LOGO_URL,
      primaryColor: "#FF6600",
    });
  });
});

describe("resolveOrgBrandTheme", () => {
  it("uses RA defaults when org is null", () => {
    expect(resolveOrgBrandTheme(null)).toEqual({
      logoUrl: RA_DEFAULT_LOGO_URL,
      primaryColor: RA_DEFAULT_PRIMARY_COLOR,
    });
  });

  it("returns the firm's https logo and hex colour", () => {
    expect(
      resolveOrgBrandTheme({
        logoUrl: "https://res.cloudinary.com/x/firm-logo.png",
        primaryColor: "#0EA5E9",
      }),
    ).toEqual({
      logoUrl: "https://res.cloudinary.com/x/firm-logo.png",
      primaryColor: "#0EA5E9",
    });
  });

  it("falls back to text-only when the logo is a data-URL (not embeddable)", () => {
    expect(
      resolveOrgBrandTheme({
        logoUrl: "data:image/png;base64,AAAA",
        primaryColor: "#0EA5E9",
      }),
    ).toEqual({
      logoUrl: RA_DEFAULT_LOGO_URL,
      primaryColor: "#0EA5E9",
    });
  });

  it("falls back to RA navy when the colour is malformed", () => {
    expect(
      resolveOrgBrandTheme({
        logoUrl: "https://cdn.example.com/l.png",
        primaryColor: "cyan",
      }),
    ).toEqual({
      logoUrl: "https://cdn.example.com/l.png",
      primaryColor: RA_DEFAULT_PRIMARY_COLOR,
    });
  });
});

describe("hexToRgb", () => {
  it("parses #FFFFFF to (1,1,1)", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("parses #000000 to (0,0,0)", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("parses RA navy #1C2E47 correctly", () => {
    const { r, g, b } = hexToRgb("#1C2E47");
    expect(r).toBeCloseTo(28 / 255, 5);
    expect(g).toBeCloseTo(46 / 255, 5);
    expect(b).toBeCloseTo(71 / 255, 5);
  });

  it("tolerates lowercase", () => {
    expect(hexToRgb("#1c2e47")).toEqual(hexToRgb("#1C2E47"));
  });
});
