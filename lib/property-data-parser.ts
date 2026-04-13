/**
 * Property Data Parser — RA2-022 (RA-104)
 * Extracts structured property metadata from OnTheHouse.com.au HTML.
 * Strategy hierarchy:
 *  1. __NEXT_DATA__ JSON (OnTheHouse is a Next.js site)
 *  2. JSON-LD structured data (Schema.org)
 *  3. HTML text pattern fallback
 */

export interface ScrapedPropertyData {
  address: string;
  url: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  carSpaces?: number;
  landSizeM2?: number;
  floorAreaM2?: number;
  floorPlanImages: string[];
  propertyImages: string[];
  scrapedAt: string;
  confidence: "high" | "medium" | "low";
}

// ── Helpers ────────────────────────────────────────────────

function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed as Record<string, unknown>);
    } catch {
      /* skip invalid */
    }
  }
  return results;
}

function extractNumber(text: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

function extractFloat(text: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

function absoluteUrl(src: string, base: string): string {
  if (src.startsWith("//")) return "https:" + src;
  if (src.startsWith("http")) return src;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function extractImages(
  html: string,
  baseUrl: string,
  filter: (src: string, alt: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = m[0];
    const src =
      tag.match(/\bdata-src="([^"]+)"/)?.[1] ??
      tag.match(/\bsrc="([^"]+)"/)?.[1];
    const alt = tag.match(/\balt="([^"]*)"/)?.[1] ?? "";
    if (!src || src.startsWith("data:")) continue;
    const full = absoluteUrl(src, baseUrl);
    if (seen.has(full)) continue;
    if (!filter(full, alt)) continue;
    seen.add(full);
    results.push(full);
  }
  return results;
}

// ── Next.js page data extraction ──────────────────────────

function parseFromNextData(
  nextData: Record<string, unknown>,
): Partial<ScrapedPropertyData> | null {
  // Drill into pageProps — structure varies by OTH version
  const props = (nextData.props as Record<string, unknown> | undefined)
    ?.pageProps;
  if (!props || typeof props !== "object") return null;
  const p = props as Record<string, unknown>;

  // Try common field paths used by real-estate Next.js apps
  const listing = (p.listing ?? p.property ?? p.data ?? p.propertyData) as
    | Record<string, unknown>
    | undefined;
  if (!listing) return null;

  return {
    bedrooms: (listing.bedrooms ?? listing.beds) as number | undefined,
    bathrooms: (listing.bathrooms ?? listing.baths) as number | undefined,
    carSpaces: (listing.carSpaces ?? listing.garages ?? listing.parking) as
      | number
      | undefined,
    landSizeM2: (listing.landSize ?? listing.landArea ?? listing.lotSize) as
      | number
      | undefined,
    floorAreaM2: (listing.floorArea ??
      listing.buildingArea ??
      listing.houseSize) as number | undefined,
    propertyType: (listing.propertyType ?? listing.category) as
      | string
      | undefined,
    address:
      typeof listing.address === "string"
        ? listing.address
        : ((listing.displayAddress ?? listing.fullAddress) as
            | string
            | undefined),
  };
}

// ── JSON-LD extraction ─────────────────────────────────────

function parseFromJsonLd(
  jsonLd: Record<string, unknown>[],
): Partial<ScrapedPropertyData> | null {
  const RESIDENCE_TYPES = [
    "SingleFamilyResidence",
    "Residence",
    "House",
    "Apartment",
    "RealEstateListing",
  ];
  const obj = jsonLd.find(
    (j) =>
      typeof j["@type"] === "string" &&
      RESIDENCE_TYPES.includes(j["@type"] as string),
  );
  if (!obj) return null;

  const addr = obj.address as Record<string, string> | string | undefined;
  const address =
    typeof addr === "string"
      ? addr
      : addr?.streetAddress
        ? [addr.streetAddress, addr.addressLocality, addr.addressRegion]
            .filter(Boolean)
            .join(", ")
        : undefined;

  return {
    address,
    bedrooms: obj.numberOfBedrooms as number | undefined,
    bathrooms: (obj.numberOfBathroomsTotal ?? obj.numberOfBathrooms) as
      | number
      | undefined,
    landSizeM2: (obj.lotSize ?? obj.floorSize) as number | undefined,
    floorAreaM2: obj.floorSize as number | undefined,
    propertyType: obj["@type"] as string | undefined,
  };
}

// ── Public API ─────────────────────────────────────────────

/**
 * Parse OnTheHouse (or similar) property page HTML into structured data.
 */
export function parseOnTheHouseHTML(
  html: string,
  sourceUrl: string,
): ScrapedPropertyData {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const base = new URL(sourceUrl).origin;

  // 1. __NEXT_DATA__
  const nextData = extractNextData(html);
  const fromNext = nextData ? parseFromNextData(nextData) : null;

  // 2. JSON-LD
  const jsonLd = extractJsonLd(html);
  const fromJsonLd = parseFromJsonLd(jsonLd);

  // Merge — Next.js data wins over JSON-LD
  const rawMerged = { ...fromJsonLd, ...fromNext };

  // Sanity-clamp numeric fields: OTH occasionally returns bogus values (e.g. 33
  // bedrooms) when the JSON path has drifted. Cap at realistic residential maxima
  // so the HTML-fallback regex gets a chance to provide a better answer.
  const clamp = (v: number | undefined, max: number): number | undefined =>
    v !== undefined && v <= max ? v : undefined;
  const merged = {
    ...rawMerged,
    bedrooms: clamp(rawMerged.bedrooms, 20),
    bathrooms: clamp(rawMerged.bathrooms, 15),
    carSpaces: clamp(rawMerged.carSpaces, 20),
  };

  const confidence: "high" | "medium" | "low" =
    fromNext && Object.keys(fromNext).length > 2
      ? "high"
      : fromJsonLd
        ? "medium"
        : "low";

  // 3. HTML fallback for any missing values
  const bedrooms =
    merged.bedrooms ??
    extractNumber(stripped, [
      /(\d+)\s*bed(?:room)?s?/i,
      /bed(?:room)?s?\s*:\s*(\d+)/i,
    ]);
  const bathrooms =
    merged.bathrooms ??
    extractNumber(stripped, [
      /(\d+)\s*bath(?:room)?s?/i,
      /bath(?:room)?s?\s*:\s*(\d+)/i,
    ]);
  const carSpaces =
    merged.carSpaces ??
    extractNumber(stripped, [
      /(\d+)\s*car\s*(?:space|garage|park)/i,
      /garage\s*:\s*(\d+)/i,
    ]);
  const landSizeM2 =
    merged.landSizeM2 ??
    extractFloat(stripped, [
      /land\s*(?:size|area)?\s*[:\-–]?\s*([\d,.]+)\s*(?:m²|sqm|m2)/i,
      /([\d,.]+)\s*(?:m²|sqm|m2)\s*land/i,
    ]);
  const floorAreaM2 =
    merged.floorAreaM2 ??
    extractFloat(stripped, [
      /(?:floor|house|building)\s*(?:size|area)?\s*[:\-–]?\s*([\d,.]+)\s*(?:m²|sqm|m2)/i,
    ]);

  // Floor plan images — look for "floor" or "plan" in src/alt
  const floorPlanImages = extractImages(
    html,
    base,
    (src, alt) =>
      /floor[-_]?plan|floorplan/i.test(src) ||
      /floor[-_]?plan|floorplan/i.test(alt),
  );

  // General property images — skip icons, logos, tiny dimension thumbnails
  const propertyImages = extractImages(
    html,
    base,
    (src) =>
      /\.(jpg|jpeg|png|webp)/i.test(src) &&
      !/logo|icon|avatar|sprite|badge/i.test(src) &&
      !/\/\d{1,3}x\d{1,3}\//i.test(src) &&
      !/data:image/i.test(src),
  ).slice(0, 24);

  // Address from og:title or <title>
  const titleMeta =
    html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1] ??
    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    "";
  const address = merged.address ?? titleMeta.replace(/\s*[-|–].*$/, "").trim();

  return {
    address,
    url: sourceUrl,
    propertyType: merged.propertyType,
    bedrooms,
    bathrooms,
    carSpaces,
    landSizeM2,
    floorAreaM2,
    floorPlanImages,
    propertyImages,
    scrapedAt: new Date().toISOString(),
    confidence,
  };
}

/**
 * Parse domain.com.au property page HTML.
 * Domain uses Next.js so the existing parseOnTheHouseHTML strategy works.
 * The address slug stripping regex differs slightly.
 */
export function parseDomainComAuHTML(
  html: string,
  sourceUrl: string,
): ScrapedPropertyData {
  // Delegate to the generic parser — __NEXT_DATA__ + JSON-LD + HTML fallback works for Domain too
  const data = parseOnTheHouseHTML(html, sourceUrl);
  // Domain puts agent names in the title after " | " — strip that suffix
  data.address = data.address.replace(/\s*\|.*$/, "").trim();
  return data;
}

/**
 * Extract property page URLs from a domain.com.au search results page.
 *
 * Domain uses __NEXT_DATA__ with a `listingsMap` or `results` key,
 * and property URLs follow the pattern /property-<type>/<suburb>-<state>-<postcode>/<id>/
 */
export function parseDomainComAuSearchResults(
  html: string,
  baseUrl: string,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  // Try __NEXT_DATA__ first
  const nextData = extractNextData(html);
  if (nextData) {
    const props = (nextData.props as Record<string, unknown>)?.pageProps;
    if (props && typeof props === "object") {
      const p = props as Record<string, unknown>;
      // Domain embeds listings in various keys
      const items = (p.listingsMap ??
        p.listings ??
        p.results ??
        p.searchResults) as unknown[] | Record<string, unknown> | undefined;

      const listArray = Array.isArray(items)
        ? items
        : Object.values(items ?? {});

      for (const item of listArray) {
        const i = item as Record<string, unknown>;
        const link = (i.url ?? i.listingUrl ?? i.canonicalUrl) as
          | string
          | undefined;
        if (link) {
          const full = absoluteUrl(link, baseUrl);
          if (!seen.has(full)) {
            seen.add(full);
            results.push(full);
          }
        }
        const slug = (i.propertySlug ?? i.slug) as string | undefined;
        if (slug) {
          const full = `${baseUrl}/${slug}`;
          if (!seen.has(full)) {
            seen.add(full);
            results.push(full);
          }
        }
      }
    }
  }

  // HTML fallback — Domain property URLs contain "property-"
  if (results.length === 0) {
    for (const m of html.matchAll(
      /href="(\/property-[^"?#]*\d{5,}[^"?#]*)"/gi,
    )) {
      const full = absoluteUrl(m[1], baseUrl);
      if (!seen.has(full)) {
        seen.add(full);
        results.push(full);
      }
    }
  }

  return results;
}

/**
 * Extract property page URLs from an OnTheHouse search results page.
 */
export function parseOnTheHouseSearchResults(
  html: string,
  baseUrl: string,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  // Next.js sites often embed the search results in __NEXT_DATA__
  const nextData = extractNextData(html);
  if (nextData) {
    const props = (nextData.props as Record<string, unknown>)?.pageProps;
    if (props && typeof props === "object") {
      const p = props as Record<string, unknown>;
      const items = (p.properties ?? p.listings ?? p.results) as
        | unknown[]
        | undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          const i = item as Record<string, unknown>;
          const slug = (i.slug ?? i.id ?? i.propertyId) as string | undefined;
          if (slug) {
            const url = `${baseUrl}/property/${slug}`;
            if (!seen.has(url)) {
              seen.add(url);
              results.push(url);
            }
          }
          const link = i.url as string | undefined;
          if (link) {
            const full = absoluteUrl(link, baseUrl);
            if (!seen.has(full)) {
              seen.add(full);
              results.push(full);
            }
          }
        }
      }
    }
  }

  // HTML fallback: look for property page hrefs
  if (results.length === 0) {
    for (const m of html.matchAll(/href="(\/property\/[^"?#]+)"/gi)) {
      const full = absoluteUrl(m[1], baseUrl);
      if (!seen.has(full)) {
        seen.add(full);
        results.push(full);
      }
    }
  }

  return results;
}
