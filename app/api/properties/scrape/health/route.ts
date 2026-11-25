/**
 * GET /api/properties/scrape/health — RA-1760, reworked for RA-8111 step 2
 *
 * Readiness probe for the property-data scraper plumbing. Read by the
 * `PropertyDataSetupWizard` before it will send any lookup.
 *
 * It answers five separate questions, each in its own field under `checks`:
 *   configured        server plumbing is wired up (the only thing proven here)
 *   providerReachable whether a provider answers
 *   planAvailable     whether a floor plan exists for an address
 *   sourcePermitted   whether using the source is legally cleared (RA-6850)
 *   featureEnabled    whether NEXT_PUBLIC_UNDERLAY_URL_IMPORT is on
 *
 * The first and last are read from local configuration. The middle three can
 * only be answered by contacting a third-party listing site, which must not
 * happen while the RA-6850 written legal sign-off is unresolved, and there is
 * no recorded sign-off to read. They therefore always report
 * "unverified (legal gate RA-6850)". When a licensed provider or the sign-off
 * exists, replace the constant with a real probe or record; never with a guess.
 *
 * Intentionally:
 *   - GET, no auth: the wizard runs before a user has any property-data config.
 *   - No outbound request of any kind.
 *   - `status` is never "ok". The best answer is "configured_unverified" and
 *     `verified` is always false, so no reader can take configured=true as
 *     "the floor-plan source works".
 *
 * Response:
 *   200 + { status: "configured_unverified", configured: true,  verified: false, ... }
 *   503 + { status: "degraded",              configured: false, verified: false, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isUnderlayUrlImportEnabled } from "@/lib/sketch/underlay-import-flag";

const NOTE =
  "Configuration only. This endpoint does not contact any property provider, so it cannot show " +
  "that a provider is reachable, that a floor plan exists for an address, or that using it is permitted.";

const UNVERIFIED = "unverified (legal gate RA-6850)";

function described(configured: "ok" | "missing") {
  const featureEnabled = isUnderlayUrlImportEnabled();
  return {
    verified: false,
    scope: "configuration-only",
    checks: {
      configured,
      providerReachable: UNVERIFIED,
      planAvailable: UNVERIFIED,
      sourcePermitted: UNVERIFIED,
      featureEnabled: featureEnabled ? "on" : "off",
    },
    ...(featureEnabled
      ? {
          warning:
            "Listing import is switched on but no written legal sign-off is recorded (RA-6850).",
        }
      : {}),
    note: NOTE,
  };
}

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 60,
    windowMs: 15 * 60 * 1000,
    prefix: "property-scrape-health",
  });
  if (rateLimited) return rateLimited;

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
        ...described("missing"),
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      status: "configured_unverified",
      configured: true,
      timestamp: new Date().toISOString(),
      ...described("ok"),
    },
    { status: 200 },
  );
}
