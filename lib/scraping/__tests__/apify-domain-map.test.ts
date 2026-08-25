import { describe, expect, it } from "vitest";
import {
  parseDomainComAuHTML,
  parseDomainComAuSearchResults,
} from "@/lib/property-data-parser";
import {
  domainListingToHtml,
  domainSearchToHtml,
  domainSuburbSaleSearchUrl,
  isDomainHost,
  isDomainPropertyListingUrl,
} from "../providers/apify-domain-map";

const LISTING_URL =
  "https://www.domain.com.au/305-17-view-street-mount-gravatt-east-qld-4122-2020744802";

describe("isDomainPropertyListingUrl", () => {
  it("accepts a Domain listing slug", () => {
    expect(isDomainPropertyListingUrl(LISTING_URL)).toBe(true);
    expect(isDomainHost(LISTING_URL)).toBe(true);
  });

  it("rejects search, suburb, and profile URLs", () => {
    expect(
      isDomainPropertyListingUrl(
        "https://www.domain.com.au/sale/?q=56+Hoff+Street",
      ),
    ).toBe(false);
    expect(
      isDomainPropertyListingUrl(
        "https://www.domain.com.au/sale/mount-gravatt-east-qld-4122/",
      ),
    ).toBe(false);
    expect(
      isDomainPropertyListingUrl(
        "https://www.domain.com.au/property-profile/2-40-raffles-street-mount-gravatt-east-qld-4122",
      ),
    ).toBe(false);
  });
});

describe("domainListingToHtml", () => {
  it("lets the Domain parser extract the floor plan from actor media", () => {
    const html = domainListingToHtml(
      {
        address: "305/17 View Street, Mount Gravatt East",
        bedroom_count: 2,
        bathroom_count: 2,
        carspace_count: 1,
        dwelling_type: "Apartment",
        media: [
          {
            media_type: "image",
            type: "photo",
            image_url: "https://rimh2.domain.com.au/photo.jpg",
          },
          {
            media_type: "image",
            type: "floor_plan",
            image_url: "https://rimh2.domain.com.au/floorplan.png",
          },
        ],
      },
      LISTING_URL,
    );

    const parsed = parseDomainComAuHTML(html, LISTING_URL);
    expect(parsed.address).toContain("305/17 View Street");
    expect(parsed.bedrooms).toBe(2);
    expect(parsed.floorPlanImages).toEqual([
      "https://rimh2.domain.com.au/floorplan.png",
    ]);
    expect(parsed.propertyImages).toEqual([
      "https://rimh2.domain.com.au/photo.jpg",
    ]);
    expect(parsed.confidence).toBe("high");
  });
});

describe("domainSuburbSaleSearchUrl", () => {
  it("builds a Domain suburb sale URL from a street address", () => {
    expect(
      domainSuburbSaleSearchUrl(
        "56 Hoff Street, Mount Gravatt East QLD 4122",
      ),
    ).toBe("https://www.domain.com.au/sale/mount-gravatt-east-qld-4122/");
  });

  it("uses a separate postcode when the address only has the state", () => {
    expect(
      domainSuburbSaleSearchUrl(
        "56 Hoff Street, Mount Gravatt East QLD",
        "4122",
      ),
    ).toBe("https://www.domain.com.au/sale/mount-gravatt-east-qld-4122/");
  });

  it("returns null when state or postcode is missing", () => {
    expect(domainSuburbSaleSearchUrl("56 Hoff Street")).toBeNull();
  });
});

describe("domainSearchToHtml", () => {
  it("lets the Domain search parser extract listing URLs", () => {
    const html = domainSearchToHtml([
      {
        seo_url:
          "https://www.domain.com.au/73-hoff-street-mount-gravatt-east-qld-4122-2020936527",
        address: "73 Hoff Street, Mount Gravatt East QLD 4122",
      },
      { seo_url: "javascript:alert(1)" },
    ]);

    expect(
      parseDomainComAuSearchResults(html, "https://www.domain.com.au"),
    ).toEqual([
      "https://www.domain.com.au/73-hoff-street-mount-gravatt-east-qld-4122-2020936527",
    ]);
  });
});
