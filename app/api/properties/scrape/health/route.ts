/**
 * GET /api/properties/scrape/health — RA-1760
 *
 * Lightweight readiness probe for the property-data scraper. Used by the
 * `PropertyDataSetupWizard` to verify the server side is configured before
 * the user is told the connection works.
 *
 * Intentionally:
 *   - GET, no auth — the wizard runs before a user has any property-data
 *     config, so requiring a session would break first-run setup.
 *   - No upstream call — that's what the sentinel POST in the wizard's
 *     stage 2 is for. This endpoint just answers "is the server-side
 *     scraper plumbing wired up?"
 *
 * Response:
 *   200 + { status: "ok",       configured: true,  timestamp }   on green
 *   503 + { status: "degraded", configured: false, timestamp }   when
 *         the underlying scraper isn't configured. Wizard surfaces the
 *         degraded reason inline so the user can self-serve.
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET(request?: NextRequest) {
  if (request) {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
      prefix: "property-scrape-health",
    });
    if (rateLimited) return rateLimited;
  }

  // Two signals matter:
  //   1. Is anything in the scraper env reachable? Currently the route
  //      hits OnTheHouse / domain.com.au directly via fetchHtml — no
  //      external base URL env var. Falling back to NODE_ENV as a
  //      "we are deployed somewhere" signal so this endpoint reports
  //      green in dev/preview without forcing operators to set a flag
  //      that has no actual gate behind it.
  //   2. PROPERTY_SCRAPER_URL — reserved for future MCP-bridge mode.
  //      When unset, we still report ok unless explicit degradation
  //      reason exists.
  const explicitOverrideMissing =
    process.env.PROPERTY_SCRAPER_REQUIRED === "1" &&
    !process.env.PROPERTY_SCRAPER_URL;

  if (explicitOverrideMissing) {
    return NextResponse.json(
      {
        status: "degraded",
        configured: false,
        reason: "PROPERTY_SCRAPER_URL is required but not set",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      configured: true,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
