/**
 * POST /api/properties/scrape — RA2-021 / RA2-022 / RA2-026 (RA-103, RA-104, RA-108)
 *
 * Scrapes AU listing sites for property / floor-plan data.
 *
 * Body: {
 *   address: string,
 *   postcode?: string,
 *   inspectionId?: string,
 *   url?: string,              // direct listing URL (preferred)
 *   fallbackSources?: string[] // e.g. ["domain","realestate"]
 * }
 *
 * Returns:
 *   - { data, cached, source } when `url` is provided (or a single cache hit)
 *   - { candidates: string[], sourceHints? } when address search finds listings
 *     (operator must confirm a candidate by re-POSTing with `url`)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError } from "@/lib/api-errors";
import { requireAddon } from "@/lib/entitlements";
import { FLOORPLAN_UNDERLAY_SKU } from "@/lib/billing/floorplan-underlay-addon";
import { isUnderlayUrlImportEnabled } from "@/lib/sketch/underlay-import-flag";
import {
  parseOnTheHouseHTML,
  parseOnTheHouseSearchResults,
  parseDomainComAuHTML,
  parseDomainComAuSearchResults,
  parseRealestateComAuHTML,
  parseRealestateComAuSearchResults,
  type ScrapedPropertyData,
} from "@/lib/property-data-parser";
import { fetchHtmlViaWorkspaceProvider } from "@/lib/scraping/dispatch";
import { resolveApifyToken } from "@/lib/scraping/providers/apify";
import { domainSuburbSaleSearchUrl } from "@/lib/scraping/providers/apify-domain-map";
import {
  fetchWithValidatedRedirect,
  scrapeHostLabel,
  normalizeScrapeUrl,
  sanitizeScrapedPropertyMedia,
  clampAddress,
  clampPostcode,
  sanitizeFallbackSources,
  isRequestBodyTooLarge,
  clampHtmlPayload,
  SCRAPE_LIMITS,
} from "@/lib/scraping/safe-fetch";

const OTH_BASE = "https://www.onthehouse.com.au";
const DOMAIN_BASE = "https://www.domain.com.au";
const REA_BASE = "https://www.realestate.com.au";
const TIMEOUT_MS = 15_000;
const MAX_CANDIDATES = SCRAPE_LIMITS.MAX_CANDIDATES;

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
    // RA-6940 — redirect: "manual" + allowlist re-validation (one hop max)
    // so an upstream 302 can never bounce this server-side fetch off the
    // allowlisted hosts (SSRF via redirect).
    const res = await fetchWithValidatedRedirect(url, {
      headers: SCRAPE_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = clampHtmlPayload(await res.text());
    const challenged = res.status === 200 && isChallengePage(html);
    const failed =
      res.status === 403 ||
      res.status === 429 ||
      res.status >= 500 ||
      challenged;
    recordBreakerOutcome(host, !failed);
    // Challenge HTML → report as 403 so downstream treats it as a
    // definite refusal rather than a "no results" false negative.
    return {
      html: challenged ? "" : html,
      status: challenged ? 403 : res.status,
    };
  } catch (err) {
    console.error("fetchHtml failed:", url, err);
    recordBreakerOutcome(host, false);
    return { html: "", status: 0 };
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-6848 [C2]: legal kill-switch — must be enabled independently of billing.
  if (!isUnderlayUrlImportEnabled()) {
    return apiError(req, {
      code: "FORBIDDEN",
      message: "Listing floor-plan import is not enabled on this deployment.",
      status: 403,
    });
  }

  // RA-6922: the floor-plan underlay is gated by the recurring $9.95/mo add-on.
  // requireAddon returns a fail-closed 402 (code ADDON_REQUIRED) when the
  // workspace has no ACTIVE FeatureEntitlement, which the client turns into the
  // "Upgrade to unlock" CTA — rather than silently consuming an outbound scrape.
  const addonGate = await requireAddon(userId, FLOORPLAN_UNDERLAY_SKU);
  if (!addonGate.allowed) return addonGate.response;

  // RA-1281: throttle outbound scraping (REA / Domain / OnTheHouse).
  const rateLimited = await applyRateLimit(req, {
    windowMs: 60_000,
    maxRequests: 6,
    prefix: "properties:scrape",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  return withIdempotency(req, userId, async (rawBody) => {
    if (isRequestBodyTooLarge(rawBody)) {
      return apiError(req, {
        code: "VALIDATION",
        message: "Request body too large",
        status: 413,
      });
    }

    let body: Record<string, unknown>;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const address = clampAddress(body.address);
    const postcode = clampPostcode(body.postcode);
    const inspectionId =
      typeof body.inspectionId === "string" &&
      body.inspectionId.length > 0 &&
      body.inspectionId.length <= 64 &&
      /^[a-zA-Z0-9_-]+$/.test(body.inspectionId)
        ? body.inspectionId
        : undefined;
    const fallbackSources = sanitizeFallbackSources(body.fallbackSources);
    const useDomainFallback =
      fallbackSources.includes("domain") || fallbackSources.length === 0;
    const useReaFallback =
      fallbackSources.includes("realestate") || fallbackSources.length === 0;

    const directUrl = body.url ? normalizeScrapeUrl(body.url) : null;
    if (body.url && !directUrl) {
      return apiError(req, {
        code: "VALIDATION",
        message:
          "url must be a valid https listing on realestate.com.au, domain.com.au, or onthehouse.com.au",
        status: 400,
      });
    }

    if (!address && !directUrl) {
      return apiError(req, {
        code: "VALIDATION",
        message: "address or url is required",
        status: 400,
      });
    }

    const normAddress = address?.toUpperCase().trim();
    const normPostcode = postcode?.trim();

    if (normAddress && normPostcode && !directUrl) {
      try {
        const cached = await prisma.propertyLookup.findFirst({
          where: {
            propertyAddress: { equals: normAddress, mode: "insensitive" },
            propertyPostcode: normPostcode,
            dataSource: { in: ["onthehouse", "domain", "realestate"] },
            expiresAt: { gt: new Date() },
          },
        });
        if (cached?.propertyData) {
          const safe = sanitizeScrapedPropertyMedia(
            cached.propertyData as ScrapedPropertyData,
          );
          return NextResponse.json({
            data: safe,
            cached: true,
            source: cached.dataSource,
          });
        }
      } catch {
        // Cache miss — continue to scrape
      }
    }

    if (!directUrl) {
      const searchQuery = [address, postcode].filter(Boolean).join(" ");
      if (searchQuery.length < 5) {
        return apiError(req, {
          code: "VALIDATION",
          message: "address is too short to search",
          status: 400,
        });
      }

      const candidates: string[] = [];
      const seen = new Set<string>();

      const pushUnique = (urls: string[]) => {
        for (const u of urls) {
          const clean = normalizeScrapeUrl(u);
          if (!clean || seen.has(clean)) continue;
          seen.add(clean);
          candidates.push(clean);
          if (candidates.length >= MAX_CANDIDATES) break;
        }
      };

      const blockedStatuses: number[] = [];
      const recordStatus = (status: number) => {
        if (status === 0 || status === 403 || status === 429 || status === 503) {
          blockedStatuses.push(status);
        }
      };

      const preferDomain = Boolean(resolveApifyToken());

      const searchDomain = async () => {
        if (!useDomainFallback || candidates.length >= MAX_CANDIDATES) return;
        const domainSearchUrl =
          domainSuburbSaleSearchUrl(address ?? searchQuery, postcode) ??
          `${DOMAIN_BASE}/sale/?q=${encodeURIComponent(searchQuery)}`;
        const { html: domainHtml, status: domainStatus } =
          await fetchHtmlViaWorkspaceProvider(
            domainSearchUrl,
            userId,
            fetchHtml,
          );
        recordStatus(domainStatus);
        if (domainStatus === 200 && domainHtml) {
          pushUnique(parseDomainComAuSearchResults(domainHtml, DOMAIN_BASE));
        }
      };

      if (preferDomain) {
        await searchDomain();
      }

      // Domain via Apify is the reliable path. Skip slower hosts once we
      // already have listings — they are usually Cloudflare-blocked.
      if (!preferDomain || candidates.length === 0) {
        if (candidates.length < MAX_CANDIDATES) {
          const searchUrl = `${OTH_BASE}/search?q=${encodeURIComponent(searchQuery)}`;
          const { html: searchHtml, status: searchStatus } =
            await fetchHtmlViaWorkspaceProvider(searchUrl, userId, fetchHtml);
          recordStatus(searchStatus);
          if (searchStatus === 200 && searchHtml) {
            pushUnique(parseOnTheHouseSearchResults(searchHtml, OTH_BASE));
          }
        }

        if (!preferDomain) {
          await searchDomain();
        }
      }

      if (candidates.length < MAX_CANDIDATES && useReaFallback && (!preferDomain || candidates.length === 0)) {
        const reaSearchUrl = `${REA_BASE}/buy/list-1?keywords=${encodeURIComponent(searchQuery)}`;
        const { html: reaHtml, status: reaStatus } =
          await fetchHtmlViaWorkspaceProvider(reaSearchUrl, userId, fetchHtml);
        recordStatus(reaStatus);
        if (reaStatus === 200 && reaHtml) {
          pushUnique(parseRealestateComAuSearchResults(reaHtml, REA_BASE));
        }
      }

      if (candidates.length === 0) {
        if (blockedStatuses.length > 0) {
          return apiError(req, {
            code: "UPSTREAM_FAILED",
            message:
              "Could not reach listing sites. Check the Apify key, or upload a floor plan image instead.",
            status: 503,
          });
        }
        return NextResponse.json(
          {
            error:
              "No property found on OnTheHouse, domain.com.au, or realestate.com.au.",
            data: null,
            candidates: [],
          },
          { status: 404 },
        );
      }

      return NextResponse.json({
        data: null,
        candidates,
        cached: false,
        source: "search",
      });
    }

    const propertyUrl = directUrl;
    const hostLabel = scrapeHostLabel(propertyUrl);
    if (hostLabel === "unknown") {
      return apiError(req, {
        code: "VALIDATION",
        message: "Unsupported listing host",
        status: 400,
      });
    }

    const { html: propertyHtml, status: propertyStatus } =
      await fetchHtmlViaWorkspaceProvider(propertyUrl, userId, fetchHtml);

    if (propertyStatus === 0) {
      return apiError(req, {
        code: "UPSTREAM_FAILED",
        message: "Could not fetch property page.",
        status: 503,
      });
    }

    const rawData =
      hostLabel === "domain"
        ? parseDomainComAuHTML(propertyHtml, propertyUrl)
        : hostLabel === "realestate"
          ? parseRealestateComAuHTML(propertyHtml, propertyUrl)
          : parseOnTheHouseHTML(propertyHtml, propertyUrl);
    const data = sanitizeScrapedPropertyMedia(rawData);

    if (normAddress && normPostcode) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

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
            dataSource: hostLabel,
            lookupCost: 0,
            confidence: data.confidence,
            propertyData: data as any,
          },
          update: {
            lookupDate: now,
            expiresAt,
            apiResponseStatus: propertyStatus,
            confidence: data.confidence,
            propertyData: data as any,
            dataSource: hostLabel,
          },
        });
      } catch (err) {
        console.error("PropertyLookup cache write failed:", err);
      }
    }

    return NextResponse.json({
      data,
      cached: false,
      source: hostLabel,
    });
  });
}
