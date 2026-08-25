/**
 * Maps dz_omar/domain-scraper dataset items into HTML the existing
 * Domain / OnTheHouse parsers already understand (__NEXT_DATA__).
 */

export interface DomainActorMedia {
  media_type?: string;
  type?: string;
  image_url?: string;
  url?: string;
}

export interface DomainActorItem {
  address?: string;
  seo_url?: string;
  url?: string;
  bedroom_count?: number;
  bathroom_count?: number;
  carspace_count?: number;
  land_area?: number;
  dwelling_type?: string;
  media?: DomainActorMedia[];
}

export function isDomainHost(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() ===
      "domain.com.au";
  } catch {
    return false;
  }
}

/** True for a single Domain listing page (not suburb/search/profile). */
export function isDomainPropertyListingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "").toLowerCase() !== "domain.com.au") {
      return false;
    }
    const path = parsed.pathname.replace(/\/$/, "");
    if (
      path.startsWith("/sale") ||
      path.startsWith("/rent") ||
      path.startsWith("/sold") ||
      path.startsWith("/property-profile")
    ) {
      return false;
    }
    return /-\d{6,}$/.test(path);
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mediaUrl(item: DomainActorMedia): string | null {
  const raw = item.image_url ?? item.url;
  return typeof raw === "string" && raw.startsWith("http") ? raw : null;
}

function listingFromItem(item: DomainActorItem) {
  const media = (item.media ?? [])
    .map((m) => {
      const url = mediaUrl(m);
      if (!url) return null;
      return { url, type: m.type ?? m.media_type ?? "photo" };
    })
    .filter((m): m is { url: string; type: string } => m !== null);

  return {
    address: item.address,
    bedrooms: item.bedroom_count,
    bathrooms: item.bathroom_count,
    carSpaces: item.carspace_count,
    landSize: item.land_area,
    propertyType: item.dwelling_type,
    media,
  };
}

function wrapNextData(pageProps: Record<string, unknown>, title = ""): string {
  const nextData = { props: { pageProps } };
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html><head><meta property="og:title" content="${safeTitle}"><title>${safeTitle}</title></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

/** One listing record → HTML `parseDomainComAuHTML` can read. */
export function domainListingToHtml(
  item: DomainActorItem,
  sourceUrl: string,
): string {
  const listing = listingFromItem(item);
  const title = listing.address ?? sourceUrl;
  return wrapNextData({ listing }, title);
}

const STREET_TYPE =
  /\b(?:street|st|road|rd|avenue|ave|court|ct|place|pl|drive|dr|crescent|cres|parade|pde|close|cl|way|lane|ln|terrace|tce|boulevard|bvd|circuit|cct|highway|hwy|grove|gr)\b/i;

/**
 * Domain's scraper honors suburb sale URLs, not `?q=` keyword search.
 * "56 Hoff Street, Mount Gravatt East QLD 4122" →
 * https://www.domain.com.au/sale/mount-gravatt-east-qld-4122/
 */
export function domainSuburbSaleSearchUrl(
  address: string,
  postcode?: string,
): string | null {
  const compact = address.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const tail = compact.match(
    /\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)(?:\s+(\d{4}))?\s*$/i,
  );
  const state = tail?.[1]?.toLowerCase();
  const pc =
    tail?.[2] ?? (postcode && /^\d{4}$/.test(postcode) ? postcode : null);
  if (!state || !pc) return null;

  const before = tail ? compact.slice(0, tail.index).trim() : compact;
  const streetMatch = STREET_TYPE.exec(before);
  const suburbPart = streetMatch
    ? before.slice(streetMatch.index + streetMatch[0].length).trim()
    : before.replace(/^\d+[A-Za-z]?\s+/, "").trim();
  if (!suburbPart) return null;

  const slug = suburbPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  return `https://www.domain.com.au/sale/${slug}-${state}-${pc}/`;
}

/** Search records → HTML `parseDomainComAuSearchResults` can read. */
export function domainSearchToHtml(items: DomainActorItem[]): string {
  const listings = items
    .map((item) => {
      const url = item.seo_url ?? item.url;
      if (typeof url !== "string" || !url.startsWith("https://")) return null;
      return { url, listingUrl: url, canonicalUrl: url };
    })
    .filter((row): row is { url: string; listingUrl: string; canonicalUrl: string } =>
      row !== null,
    );
  return wrapNextData({ listings });
}
