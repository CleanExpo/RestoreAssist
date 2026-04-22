import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * Middleware handles two orthogonal slices:
 *
 *   1. `/dashboard/*` — RA-1259 onboarding gate for Google OAuth signups.
 *   2. `/api/*` mutations — RA-1540 default IP rate-limit baseline.
 *
 * Both are matched via the exported `config.matcher`; dispatch happens
 * by path prefix + method inside `middleware()`.
 */

// RA-1540 — default cap for any /api/* mutation (POST/PATCH/PUT/DELETE).
// Routes that need stricter limits call `applyRateLimit` inside their
// handler with a narrower key (user id, tighter window). Those per-route
// limits STILL apply — middleware runs first, route runs second; both
// caps must pass. Intentionally generous so legitimate clients aren't
// throttled. Public endpoints (webhooks, signup) override via their own
// stricter limits today; the middleware just catches unrated routes.
const API_DEFAULT_WINDOW_MS = 60 * 1000;
const API_DEFAULT_MAX = 120;
const API_MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Paths the middleware should NOT rate-limit — external systems that
// legitimately fire bursts (Stripe/Xero retries), or routes that handle
// their own tighter caps including fail-closed Upstash behaviour and
// should be exempt from the middleware's permissive baseline.
const API_RATE_LIMIT_SKIP = [
  "/api/webhooks/", // inbound webhooks — providers retry with bursts
  "/api/auth/",     // NextAuth internal endpoints manage their own flow
];

function shouldSkipApiRateLimit(pathname: string): boolean {
  return API_RATE_LIMIT_SKIP.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── /api/* mutations — apply default IP rate-limit (RA-1540) ────────────────
  if (
    pathname.startsWith("/api/") &&
    API_MUTATION_METHODS.has(req.method.toUpperCase()) &&
    !shouldSkipApiRateLimit(pathname)
  ) {
    const limited = await applyRateLimit(req, {
      windowMs: API_DEFAULT_WINDOW_MS,
      maxRequests: API_DEFAULT_MAX,
      prefix: "api:mw",
    });
    if (limited) return limited;
    // Fall through — route handler executes; any route-level
    // applyRateLimit it calls layers on top.
  }

  // ── /dashboard/* — onboarding gate (RA-1259, unchanged) ─────────────────────
  if (pathname.startsWith("/dashboard/")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) return NextResponse.next();
    const needsOnboarding = Boolean((token as any).needsOnboarding);
    if (!needsOnboarding) return NextResponse.next();
    if (pathname.startsWith("/onboarding/account-type")) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding/account-type";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    // RA-1540 — baseline rate-limit on all /api/*. The middleware itself
    // filters to mutation methods; GETs pass through without overhead.
    "/api/:path*",
  ],
};
