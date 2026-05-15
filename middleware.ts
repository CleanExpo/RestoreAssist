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
  "/api/auth/", // NextAuth internal endpoints manage their own flow
];

function shouldSkipApiRateLimit(pathname: string): boolean {
  return API_RATE_LIMIT_SKIP.some((prefix) => pathname.startsWith(prefix));
}

// Prefixes that require an authenticated session. Anything matched by the
// route-level `config.matcher` below that ALSO matches one of these prefixes
// triggers the unauth → /login redirect with a `?callbackUrl=` carrying the
// originally-requested path (RA-1376 / Punch-list P1 #16).
//
// `/invite/*` is intentionally NOT here — those URLs are token-protected
// (the token in the path is the credential), so an unauthenticated visitor
// is the expected case.
const LOGIN_GATE_PREFIXES = [
  "/dashboard/",
  "/reports/",
  "/reports",
  "/compliance/",
  "/compliance",
  "/sign/",
  "/sign",
];

function requiresLogin(pathname: string): boolean {
  return LOGIN_GATE_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}

// Paths that bypass the setup gate even when the flag is on.
const SETUP_GATE_BYPASS = [
  "/setup",
  "/api/setup/",
  "/api/auth/",
  "/api/cron/",
  "/login",
  "/signup",
  "/portal/login",
  "/portal/signup",
  "/onboarding/",
  "/_next/",
  "/favicon",
  "/icon",
  "/apple-icon",
  "/manifest",
  "/sitemap",
  "/robots",
];

function shouldBypassSetupGate(pathname: string): boolean {
  // Exact match for /setup (without trailing slash)
  if (pathname === "/setup") return true;
  return SETUP_GATE_BYPASS.some((prefix) => pathname.startsWith(prefix));
}

// SP-3 T15 — paths that bypass the hard-paywall redirect even when the
// user's trial has expired. Upgrade flow + billing webhooks + auth pages
// must remain reachable so the user can actually pay.
const HARD_PAYWALL_WHITELIST = [
  "/billing/upgrade",
  "/billing/success",
  "/api/billing",
  "/api/webhooks/stripe",
  "/api/auth",
  "/logout",
  "/pricing",
] as const;

function isHardPaywallWhitelisted(pathname: string): boolean {
  return HARD_PAYWALL_WHITELIST.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Setup wizard gate — FIRST check, flag-guarded (Phase 6, Task 18) ────────
  // Safety lever: read env at request time so the flag can be toggled without
  // redeploying. If the flag is off, this entire block is completely inert.
  const SETUP_WIZARD_ENABLED = process.env.SETUP_WIZARD_ENABLED === "true";
  if (SETUP_WIZARD_ENABLED && !shouldBypassSetupGate(pathname)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    // C1+C3 fix: gate on setupCompletedAt only — role-agnostic.
    // The old OWNER/ADMIN/TECHNICIAN branches used role strings that don't
    // exist in the schema (Role enum: USER | ADMIN | MANAGER), making the
    // OWNER branch dead code and the TECHNICIAN branch a 404 trap.
    if (token && !(token as any).setupCompletedAt) {
      const url = req.nextUrl.clone();
      url.pathname = "/setup";
      url.search = "";
      return NextResponse.redirect(url, 307);
    }
  }

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

  // ── Unauth → /login redirect for protected surfaces (P1 #16) ────────────────
  // Preserves the originally-requested path via `?callbackUrl=`. The login
  // page validates the value against a same-origin allowlist before honouring
  // it post-sign-in (see lib/auth/safe-callback-url.ts).
  if (requiresLogin(pathname)) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?callbackUrl=${encodeURIComponent(pathname + (req.nextUrl.search || ""))}`;
      return NextResponse.redirect(url, 307);
    }
    // ── /dashboard/* — onboarding gate (RA-1259, unchanged) ──────────────────
    if (pathname.startsWith("/dashboard/")) {
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
  }

  // ── Hard-paywall — DISABLED in middleware (SP-3 T15 hotfix) ────────────────
  // Edge-runtime middleware cannot use Prisma (Node-binary engine); the
  // previous getTrialStatus() call crashed every authenticated request and
  // produced a prod sign-in loop. Trial-expired enforcement still runs in
  // route handlers + server components (CLAUDE.md rule #8 — subscription
  // gate before every AI call). When restored later this MUST read trial
  // state from JWT claims stamped in jwt() (lib/auth.ts), not from Prisma.
  void isHardPaywallWhitelisted;

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/reports/:path*",
    "/compliance/:path*",
    "/sign/:path*",
    "/invite/:path*",
    "/setup/:path*",
    "/setup",
    // RA-1540 — baseline rate-limit on all /api/*. The middleware itself
    // filters to mutation methods; GETs pass through without overhead.
    "/api/:path*",
  ],
};
