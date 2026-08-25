import { describe, expect, it } from "vitest";
import {
  parseRealestateComAuHTML,
  parseRealestateComAuSearchResults,
} from "@/lib/property-data-parser";

describe("parseRealestateComAuSearchResults", () => {
  it("extracts property-* listing hrefs from HTML", () => {
    const html = `
      <a href="/property-house-qld-brisbane-4000-12345678">listing</a>
      <a href="/property-apartment-nsw-sydney-2000-87654321">other</a>
    `;
    const urls = parseRealestateComAuSearchResults(
      html,
      "https://www.realestate.com.au",
    );
    expect(urls).toEqual([
      "https://www.realestate.com.au/property-house-qld-brisbane-4000-12345678",
      "https://www.realestate.com.au/property-apartment-nsw-sydney-2000-87654321",
    ]);
  });
});

describe("parseRealestateComAuHTML", () => {
  it("returns a ScrapedPropertyData shape with source url", () => {
    const html = `<html><head><title>12 Smith St | Agent</title></head><body></body></html>`;
    const data = parseRealestateComAuHTML(
      html,
      "https://www.realestate.com.au/property-house-qld-brisbane-4000-1",
    );
    expect(data.url).toContain("realestate.com.au");
    expect(Array.isArray(data.floorPlanImages)).toBe(true);
    expect(Array.isArray(data.propertyImages)).toBe(true);
  });
});
