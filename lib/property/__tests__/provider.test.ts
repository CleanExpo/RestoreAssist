import { describe, expect, it } from "vitest";
import { normalizeScrapedProperty } from "../provider";
import type { ScrapedPropertyData } from "../../property-data-parser";
import { OnTheHouseProvider } from "../providers/onthehouse";

const RAW: ScrapedPropertyData = {
  address: "12 Test St, Brisbane, QLD",
  url: "https://www.onthehouse.com.au/property/qld/brisbane/12-test-st",
  propertyType: "House",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 1,
  landSizeM2: 405,
  floorAreaM2: 180,
  floorPlanImages: ["https://img/floorplan-1.jpg"],
  propertyImages: ["https://img/p1.jpg", "https://img/p2.jpg"],
  scrapedAt: "2026-06-09T00:00:00.000Z",
  confidence: "high",
};

describe("normalizeScrapedProperty", () => {
  it("maps scraper fields onto the canonical enrichment shape", () => {
    const e = normalizeScrapedProperty(RAW, "apify-onthehouse");
    expect(e.address).toBe("12 Test St, Brisbane, QLD");
    expect(e.beds).toBe(4);
    expect(e.baths).toBe(2);
    expect(e.carSpaces).toBe(1);
    expect(e.landSizeM2).toBe(405);
    expect(e.floorAreaM2).toBe(180);
    expect(e.propertyType).toBe("House");
    expect(e.floorPlanImages).toEqual(["https://img/floorplan-1.jpg"]);
    expect(e.source).toBe("apify-onthehouse");
    expect(e.confidence).toBe("high");
    expect(typeof e.retrievedAt).toBe("string");
  });

  it("coerces missing numeric fields to null (not undefined)", () => {
    const sparse: ScrapedPropertyData = {
      address: "1 Bare St",
      url: "https://x/y",
      floorPlanImages: [],
      propertyImages: [],
      scrapedAt: "2026-06-09T00:00:00.000Z",
      confidence: "low",
    };
    const e = normalizeScrapedProperty(sparse, "apify-onthehouse");
    expect(e.beds).toBeNull();
    expect(e.baths).toBeNull();
    expect(e.landSizeM2).toBeNull();
    expect(e.floorAreaM2).toBeNull();
    expect(e.propertyType).toBeNull();
  });
});

describe("OnTheHouseProvider (fetch injected)", () => {
  const FIXTURE_HTML = `<!doctype html><html><head>
    <script type="application/ld+json">
    {"@type":"House","address":{"streetAddress":"12 Test St","addressLocality":"Brisbane","addressRegion":"QLD"},"numberOfBedrooms":4,"numberOfBathroomsTotal":2,"floorSize":180}
    </script></head><body></body></html>`;

  it("returns canonical enrichment from fetched HTML", async () => {
    const provider = new OnTheHouseProvider(async () => ({
      html: FIXTURE_HTML,
      url: "https://www.onthehouse.com.au/property/qld/brisbane/12-test-st",
    }));
    const e = await provider.lookup({ address: "12 Test St, Brisbane QLD" });
    expect(e).not.toBeNull();
    expect(e!.beds).toBe(4);
    expect(e!.baths).toBe(2);
    expect(e!.floorAreaM2).toBe(180);
    expect(e!.address.toLowerCase()).toContain("brisbane");
    expect(e!.source).toBe("apify-onthehouse");
  });

  it("returns null when the fetcher finds nothing", async () => {
    const provider = new OnTheHouseProvider(async () => null);
    expect(await provider.lookup({ address: "nowhere" })).toBeNull();
  });

  it("exposes a stable provider id", () => {
    const provider = new OnTheHouseProvider(async () => null);
    expect(provider.id).toBe("apify-onthehouse");
  });
});
