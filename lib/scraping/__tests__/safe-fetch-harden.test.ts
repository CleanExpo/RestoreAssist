/**
 * Hardening tests for listing scrape URL / media sanitization.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeScrapeUrl,
  isAllowedScrapeUrl,
  sanitizeScrapedImageUrl,
  sanitizeScrapedImageList,
  sanitizeScrapedPropertyMedia,
  clampAddress,
  clampPostcode,
  sanitizeFallbackSources,
  isRequestBodyTooLarge,
  SCRAPE_LIMITS,
} from "../safe-fetch";

describe("normalizeScrapeUrl — planted SSRF / injection cases", () => {
  it("accepts allowlisted https listing URLs", () => {
    expect(
      normalizeScrapeUrl(
        "https://www.realestate.com.au/property-house-qld-brisbane-4000-1",
      ),
    ).toMatch(/^https:\/\/www\.realestate\.com\.au\//);
    expect(isAllowedScrapeUrl("https://www.domain.com.au/sale/1")).toBe(true);
  });

  it("rejects credentials, http, odd ports, and IP literals", () => {
    expect(
      normalizeScrapeUrl("https://user:pass@www.domain.com.au/x"),
    ).toBeNull();
    expect(normalizeScrapeUrl("http://www.domain.com.au/x")).toBeNull();
    expect(normalizeScrapeUrl("https://www.domain.com.au:8443/x")).toBeNull();
    expect(normalizeScrapeUrl("https://127.0.0.1/x")).toBeNull();
    expect(normalizeScrapeUrl("https://[::1]/x")).toBeNull();
  });

  it("rejects lookalike hosts and metadata", () => {
    expect(
      normalizeScrapeUrl("https://www.domain.com.au.evil.com/x"),
    ).toBeNull();
    expect(normalizeScrapeUrl("https://evil.com/x")).toBeNull();
    expect(normalizeScrapeUrl("javascript:alert(1)")).toBeNull();
  });

  it("strips fragments and lowercases host", () => {
    expect(
      normalizeScrapeUrl(
        "https://WWW.Domain.com.au/property-1#section",
      ),
    ).toBe("https://www.domain.com.au/property-1");
  });
});

describe("sanitizeScrapedImageUrl", () => {
  it("keeps normal https CDN images", () => {
    expect(
      sanitizeScrapedImageUrl("https://i2.au.reastatic.net/800x600/abc.jpg"),
    ).toBe("https://i2.au.reastatic.net/800x600/abc.jpg");
  });

  it("rejects data/javascript/metadata/private hosts", () => {
    expect(sanitizeScrapedImageUrl("data:image/png;base64,aaa")).toBeNull();
    expect(sanitizeScrapedImageUrl("javascript:alert(1)")).toBeNull();
    expect(
      sanitizeScrapedImageUrl("https://169.254.169.254/latest/meta-data"),
    ).toBeNull();
    expect(sanitizeScrapedImageUrl("https://localhost/img.png")).toBeNull();
    expect(
      sanitizeScrapedImageUrl("https://user:pass@cdn.example.com/a.png"),
    ).toBeNull();
  });

  it("filters lists and caps length", () => {
    const list = sanitizeScrapedImageList(
      [
        "https://cdn.example.com/a.jpg",
        "javascript:evil",
        "https://cdn.example.com/a.jpg",
        "http://cdn.example.com/b.jpg",
      ],
      10,
    );
    expect(list).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  it("sanitizes property media payloads", () => {
    const safe = sanitizeScrapedPropertyMedia({
      floorPlanImages: ["https://ok.example/fp.png", "data:x"],
      propertyImages: ["https://ok.example/p.png", "https://127.0.0.1/x"],
    });
    expect(safe.floorPlanImages).toEqual(["https://ok.example/fp.png"]);
    expect(safe.propertyImages).toEqual(["https://ok.example/p.png"]);
  });
});

describe("request field clamps", () => {
  it("clamps address and validates postcode", () => {
    expect(clampAddress("  12 Smith St  ")).toBe("12 Smith St");
    expect(clampAddress("x".repeat(500))?.length).toBe(
      SCRAPE_LIMITS.MAX_ADDRESS_LENGTH,
    );
    expect(clampPostcode("4000")).toBe("4000");
    expect(clampPostcode("not a postcode!!!")).toBeUndefined();
  });

  it("whitelists fallback sources only", () => {
    expect(
      sanitizeFallbackSources(["domain", "evil", "realestate", "domain"]),
    ).toEqual(["domain", "realestate"]);
  });

  it("rejects oversized bodies", () => {
    expect(isRequestBodyTooLarge("x".repeat(SCRAPE_LIMITS.MAX_REQUEST_BODY_BYTES + 1))).toBe(
      true,
    );
    expect(isRequestBodyTooLarge("{}")).toBe(false);
  });
});
