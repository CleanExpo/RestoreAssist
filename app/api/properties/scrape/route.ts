/**
 * POST /api/properties/scrape — RA2-021 / RA2-022 / RA2-026 (RA-103, RA-104, RA-108)
 *
 * Scrapes OnTheHouse.com.au for property data. Optionally falls back to
 * domain.com.au if OTH returns no results (RA-108, off by default).
 *
 * Body: {
 *   address: string,
 *   postcode?: string,
 *   inspectionId?: string,
 *   url?: string,
 *   fallbackSources?: string[]  // e.g. ["domain"] to enable domain.com.au fallback
 * }
 * Returns: { data: ScrapedPropertyData, cached: boolean, source: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseOnTheHouseHTML,
  parseOnTheHouseSearchResults,
  parseDomainComAuHTML,
  parseDomainComAuSearchResults,
  type ScrapedPropertyData,
} from "@/lib/property-data-parser";

const OTH_BASE = "https://www.onthehouse.com.au";
const DOMAIN_BASE = "https://www.domain.com.au";
const DDG_HTML = "https://html.duckduckgo.com/html";
const TIMEOUT_MS = 15_000;

const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

async function fetchHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  try {
    const res = await fetch(url, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await res.text();
    return { html, status: res.status };
  } catch (err) {
    console.error("fetchHtml failed:", url, err);
    return { html: "", status: 0 };
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    address,
    postcode,
    inspectionId,
    url: directUrl,
  } = body as Record<string, string>;
  const fallbackSources = (body.fallbackSources as string[] | undefined) ?? [];
  const useDomainFallback = fallbackSources.includes("domain");

  if (!address && !directUrl) {
    return NextResponse.json(
      { error: "address or url is required" },
      { status: 400 },
    );
  }

  const normAddress = address?.toUpperCase().trim();
  const normPostcode = postcode?.trim();

  // ── Check cache ─────────────────────────────────────────
  if (normAddress && normPostcode) {
    try {
      const cached = await prisma.propertyLookup.findFirst({
        where: {
          propertyAddress: { equals: normAddress, mode: "insensitive" },
          propertyPostcode: normPostcode,
          dataSource: "onthehouse",
          expiresAt: { gt: new Date() },
        },
      });
      if (cached?.propertyData) {
        return NextResponse.json({ data: cached.propertyData, cached: true });
      }
    } catch {
      // Cache miss — continue to scrape
    }
  }

  // ── Resolve property URL ────────────────────────────────
  let propertyUrl = directUrl as string | undefined;
  let sourceLabel = "onthehouse";

  if (!propertyUrl) {
    const searchQuery = [address, postcode].filter(Boolean).join(" ");

    // ── Step 1: DuckDuckGo HTML search for OTH property page ─────────────
    // DDG's HTML endpoint returns static, scrapeable results — unlike OTH/Domain
    // which are SPA sites that render search results via JavaScript.
    const ddgOthUrl = `${DDG_HTML}/?q=${encodeURIComponent(`site:onthehouse.com.au/property ${searchQuery}`)}`;
    const { html: ddgOthHtml, status: ddgOthStatus } = await fetchHtml(ddgOthUrl);

    if (ddgOthStatus === 200 && ddgOthHtml) {
      // DDG wraps result links as /l/?uddg=ENCODED_URL — decode to get the real URL.
      // Also check for direct hrefs in case DDG format changes.
      const urlCandidates: string[] = [];
      for (const m of ddgOthHtml.matchAll(/uddg=([^&">\s]+)/gi)) {
        try { urlCandidates.push(decodeURIComponent(m[1])); } catch { /* skip */ }
      }
      for (const m of ddgOthHtml.matchAll(/href="(https:\/\/www\.onthehouse\.com\.au\/property\/[^"?#]+)"/gi)) {
        urlCandidates.push(m[1]);
      }
      const othCandidate = urlCandidates.find(u => u.startsWith(`${OTH_BASE}/property/`));
      if (othCandidate) {
        propertyUrl = othCandidate;
        sourceLabel = "onthehouse";
      }
    }

    // ── Step 2: DuckDuckGo fallback for domain.com.au ─────────────────────
    if (!propertyUrl) {
      const ddgDomainUrl = `${DDG_HTML}/?q=${encodeURIComponent(`site:domain.com.au/property ${searchQuery}`)}`;
      const { html: ddgDomainHtml, status: ddgDomainStatus } = await fetchHtml(ddgDomainUrl);

      if (ddgDomainStatus === 200 && ddgDomainHtml) {
        const urlCandidates: string[] = [];
        for (const m of ddgDomainHtml.matchAll(/uddg=([^&">\s]+)/gi)) {
          try { urlCandidates.push(decodeURIComponent(m[1])); } catch { /* skip */ }
        }
        for (const m of ddgDomainHtml.matchAll(/href="(https:\/\/www\.domain\.com\.au\/[^"?#]*-\d{6,}[^"?#]*)"/gi)) {
          urlCandidates.push(m[1]);
        }
        const domainCandidate = urlCandidates.find(u => u.includes("domain.com.au") && /-\d{6,}/.test(u));
        if (domainCandidate) {
          propertyUrl = domainCandidate;
          sourceLabel = "domain";
        }
      }
    }

    // ── Step 3: Give up gracefully ─────────────────────────────────────────
    if (!propertyUrl) {
      return NextResponse.json(
        { error: "No property listing found for this address. Try uploading a floor plan manually.", data: null },
        { status: 404 },
      );
    }
  }

  const isDomainUrl = propertyUrl?.startsWith(DOMAIN_BASE);

  // ── Fetch and parse property page ───────────────────────
  const { html: propertyHtml, status: propertyStatus } =
    await fetchHtml(propertyUrl);

  if (propertyStatus === 0) {
    return NextResponse.json(
      { error: "Could not fetch property page." },
      { status: 503 },
    );
  }

  const data = isDomainUrl
    ? parseDomainComAuHTML(propertyHtml, propertyUrl)
    : parseOnTheHouseHTML(propertyHtml, propertyUrl);

  // ── Cache the result ────────────────────────────────────
  if (normAddress && normPostcode) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    try {
      await prisma.propertyLookup.upsert({
        where: {
          address_postcode_unique: {
            propertyAddress: normAddress,
            propertyPostcode: normPostcode,
          },
        },
        create: {
          propertyAddress: normAddress,
          propertyPostcode: normPostcode,
          lookupDate: now,
          expiresAt,
          apiResponseStatus: propertyStatus,
          dataSource: isDomainUrl ? "domain" : "onthehouse",
          lookupCost: 0,
          confidence: data.confidence,
          propertyData: data as any,
          ...(inspectionId ? { inspectionId } : {}),
        },
        update: {
          lookupDate: now,
          expiresAt,
          apiResponseStatus: propertyStatus,
          confidence: data.confidence,
          propertyData: data as any,
        },
      });
    } catch (err) {
      // Non-fatal — return the data even if caching fails
      console.error("PropertyLookup cache write failed:", err);
    }
  }

  // Update sourceLabel if we ended up on domain.com.au
  if (isDomainUrl) sourceLabel = "domain";

  return NextResponse.json({ data, cached: false, source: sourceLabel });
}
