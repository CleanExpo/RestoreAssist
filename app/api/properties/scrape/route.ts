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
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  parseOnTheHouseHTML,
  parseOnTheHouseSearchResults,
  parseDomainComAuHTML,
  parseDomainComAuSearchResults,
  type ScrapedPropertyData,
} from "@/lib/property-data-parser";

const OTH_BASE = "https://www.onthehouse.com.au";
const DOMAIN_BASE = "https://www.domain.com.au";
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

// RA-1324 — per-host circuit breaker. If a host returns 403 / 429 /
// Cloudflare challenge HTML 3 times in a row within a 5-min window,
// trip the breaker and stop hitting it for 30 min. This protects the
// Vercel egress IP range from escalating bans when upstream starts
// rejecting us (captcha, rate limit, TOS-enforcement). Per-host
// state lives in module scope — stateless across cold starts, but
// a warm fn instance won't keep hammering after the first trip.
type BreakerState = {
  consecutiveFails: number;
  lastFailAt: number;
  openedUntil: number; // 0 = closed; >now() = open
};
const HOST_BREAKER: Map<string, BreakerState> = new Map();
const BREAKER_FAIL_THRESHOLD = 3;
const BREAKER_FAIL_WINDOW_MS = 5 * 60 * 1000;
const BREAKER_OPEN_DURATION_MS = 30 * 60 * 1000;

function getHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function isBreakerOpen(host: string): boolean {
  const s = HOST_BREAKER.get(host);
  if (!s) return false;
  return s.openedUntil > Date.now();
}

function recordBreakerOutcome(host: string, success: boolean) {
  const now = Date.now();
  const s = HOST_BREAKER.get(host) ?? {
    consecutiveFails: 0,
    lastFailAt: 0,
    openedUntil: 0,
  };
  if (success) {
    s.consecutiveFails = 0;
    s.openedUntil = 0;
  } else {
    // Reset streak if the last failure was outside the window.
    if (now - s.lastFailAt > BREAKER_FAIL_WINDOW_MS) {
      s.consecutiveFails = 0;
    }
    s.consecutiveFails++;
    s.lastFailAt = now;
    if (s.consecutiveFails >= BREAKER_FAIL_THRESHOLD) {
      s.openedUntil = now + BREAKER_OPEN_DURATION_MS;
      console.warn(
        `[scrape] Circuit breaker OPENED for ${host} after ${s.consecutiveFails} consecutive failures. Holding off until ${new Date(s.openedUntil).toISOString()}`,
      );
    }
  }
  HOST_BREAKER.set(host, s);
}

// Detect a Cloudflare / Captcha challenge page returned as 200. These
// are sub-1KB HTML with distinctive tokens and no actual listing data.
function isChallengePage(html: string): boolean {
  if (!html || html.length > 10_000) return false;
  const lower = html.toLowerCase();
  return (
    lower.includes("just a moment") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("cf-challenge") ||
    lower.includes("please verify you are human") ||
    lower.includes("captcha") ||
    lower.includes("attention required")
  );
}

async function fetchHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  const host = getHost(url);

  // Circuit breaker: short-circuit if this host is in time-out.
  if (isBreakerOpen(host)) {
    console.warn(
      `[scrape] Circuit breaker OPEN for ${host} — skipping fetch, returning synthetic 503`,
    );
    return { html: "", status: 503 };
  }

  try {
    const res = await fetch(url, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await res.text();
    const challenged = res.status === 200 && isChallengePage(html);
    const failed =
      res.status === 403 ||
      res.status === 429 ||
      res.status >= 500 ||
      challenged;
    recordBreakerOutcome(host, !failed);
    // Challenge HTML → report as 403 so downstream treats it as a
    // definite refusal rather than a "no results" false negative.
    return { html: challenged ? "" : html, status: challenged ? 403 : res.status };
  } catch (err) {
    console.error("fetchHtml failed:", url, err);
    recordBreakerOutcome(host, false);
    return { html: "", status: 0 };
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RA-1281: throttle outbound scraping to OnTheHouse + domain.com.au.
  // Without this, a UI loop or malicious session can hammer the upstream
  // and get our IP range banned. Cache hits short-circuit before the
  // scrape; this limit only bites on cache misses. 6/min/user is enough
  // for real inspection batching and safely under any reasonable TOS.
  const rateLimited = await applyRateLimit(req, {
    windowMs: 60_000,
    maxRequests: 6,
    prefix: "properties:scrape",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

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

  // RA-1347: if the caller supplied `url` directly, only accept it when
  // it's an OnTheHouse or domain.com.au URL. Otherwise we'd SSRF a
  // server-side HTTPS GET at an attacker-chosen host (internal Supabase,
  // localhost, cloud metadata IMDS on non-Vercel infra).
  if (directUrl) {
    try {
      const parsed = new URL(directUrl);
      const isOth =
        parsed.protocol === "https:" &&
        (parsed.hostname === "www.onthehouse.com.au" ||
          parsed.hostname === "onthehouse.com.au");
      const isDomain =
        parsed.protocol === "https:" &&
        (parsed.hostname === "www.domain.com.au" ||
          parsed.hostname === "domain.com.au");
      if (!isOth && !isDomain) {
        return NextResponse.json(
          { error: "url must be on onthehouse.com.au or domain.com.au" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
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
    const searchUrl = `${OTH_BASE}/search?q=${encodeURIComponent(searchQuery)}`;
    const { html: searchHtml, status: searchStatus } =
      await fetchHtml(searchUrl);

    // Parse OTH results only when the search page returned successfully
    const othUrls =
      searchStatus === 200
        ? parseOnTheHouseSearchResults(searchHtml, OTH_BASE)
        : [];

    if (othUrls.length > 0) {
      propertyUrl = othUrls[0];
    } else {
      // ── domain.com.au fallback (RA-108) ─────────────────
      // Triggered when: OTH search fails (404/503/network), returns no listings,
      // OR caller explicitly opts in. Allows the scraper to survive OTH URL changes.
      if (!useDomainFallback && searchStatus === 0) {
        return NextResponse.json(
          { error: "Could not connect to OnTheHouse. Please try again." },
          { status: 503 },
        );
      }

      if (!useDomainFallback && othUrls.length === 0 && searchStatus === 200) {
        // OTH returned a page but found no listings — give up without domain fallback
        return NextResponse.json(
          {
            error: "No property found on OnTheHouse for this address.",
            data: null,
          },
          { status: 404 },
        );
      }

      // Try domain.com.au when: OTH returned non-200 (broken search) OR no results
      const domainSearchUrl = `${DOMAIN_BASE}/sale/?q=${encodeURIComponent(searchQuery)}`;
      const { html: domainHtml, status: domainStatus } =
        await fetchHtml(domainSearchUrl);

      if (domainStatus !== 200 || !domainHtml) {
        return NextResponse.json(
          {
            error:
              "No property found. OnTheHouse search unavailable and domain.com.au did not respond.",
            data: null,
          },
          { status: 404 },
        );
      }

      const domainUrls = parseDomainComAuSearchResults(domainHtml, DOMAIN_BASE);
      if (!domainUrls.length) {
        return NextResponse.json(
          {
            error: "No property found on OnTheHouse or domain.com.au.",
            data: null,
          },
          { status: 404 },
        );
      }
      propertyUrl = domainUrls[0];
      sourceLabel = "domain";
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
