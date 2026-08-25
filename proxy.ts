import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { applyRateLimitEdge } from "@/lib/rate-limiter-edge";

/**
 * Middleware handles two orthogonal slices:
 *
 *   1. `/dashboard/*` — RA-1259 onboarding gate for Google OAuth signups.
 *   2. `/api/*` mutations — RA-1540 default IP rate-limit baseline.
 *
 * Both are matched via the exported `config.matcher`; dispatch happens
 * by path prefix + method inside `proxy()`.
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
  "/dashboard",
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

// Pages the setup wizard itself links out to. Each traces to one control on
// /setup, and every one of them 307s straight back to /setup without an entry
// here — turning the wizard's own remedies into dead ends:
//   - /dashboard/subscription           IntegrationsCard "View add-ons" / "View plans"
//   - /dashboard/integrations           IntegrationsCard "Set up Ascora" (API-key provider)
//   - /dashboard/settings/ai-providers  IntegrationsCard "Manage AI keys"
//
// These are matched on a segment boundary rather than added to
// SETUP_GATE_BYPASS, whose plain `startsWith` would also admit a future
// sibling such as /dashboard/subscription-audit. The prefix list cannot be
// tightened wholesale: entries like "/favicon" and "/icon" exist precisely to
// match "/favicon.ico" and "/icon-192.png".
const SETUP_WIZARD_DESTINATIONS = [
  "/dashboard/subscription",
  "/dashboard/addons",
  "/dashboard/success",
  "/dashboard/integrations",
  "/dashboard/settings/ai-providers",
];

// Exact API dependencies of the three destinations above. Keeping these as
// exact paths (rather than broad prefixes) prevents an incomplete workspace
// from using the setup funnel to bypass unrelated operational APIs. Every
// route still performs its own session, workspace and entitlement checks.
const SETUP_WIZARD_API_DESTINATIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  "/api/subscription": new Set(["GET"]),
  "/api/subscription/portal": new Set(["POST"]),
  "/api/create-checkout-session": new Set(["POST"]),
  "/api/reactivate-subscription": new Set(["POST"]),
  "/api/addons/catalog": new Set(["GET"]),
  "/api/addons/checkout": new Set(["POST"]),
  "/api/addons/verify": new Set(["POST"]),
  "/api/verify-subscription": new Set(["POST"]),
  "/api/check-active-subscription": new Set(["POST"]),
  "/api/user/profile": new Set(["GET"]),
  "/api/user/cloud-mirror": new Set(["GET"]),
  "/api/integrations": new Set(["GET", "POST"]),
  "/api/ascora/connect": new Set(["GET", "POST"]),
  "/api/dr-nrpg/connect": new Set(["GET", "POST"]),
  "/api/onboarding/status": new Set(["GET"]),
  "/api/pricing-config": new Set(["GET"]),
  "/api/workspace/status": new Set(["GET"]),
  "/api/workspace/provider-connections": new Set(["GET", "POST", "DELETE"]),
  "/api/workspace/provider-connections/validate": new Set(["POST"]),
};

function isWizardDestination(pathname: string): boolean {
  return SETUP_WIZARD_DESTINATIONS.includes(pathname);
}

function isSetupOAuthRoute(pathname: string, method: string): boolean {
  if (
    method === "GET" &&
    [
      "/api/oauth/google-drive/status",
      "/api/oauth/google-drive/start",
      "/api/oauth/google-drive/callback",
      "/api/oauth/microsoft-onedrive/status",
      "/api/oauth/microsoft-onedrive/start",
      "/api/oauth/microsoft-onedrive/callback",
    ].includes(pathname)
  ) {
    return true;
  }

  const match = pathname.match(
    /^\/api\/integrations\/oauth\/(xero|myob|quickbooks|servicem8)\/(connect|callback)$/,
  );
  if (!match) return false;
  return match[2] === "connect" ? method === "POST" : method === "GET";
}

function shouldBypassSetupGate(pathname: string, method: string): boolean {
  // Exact match for /setup (without trailing slash)
  if (pathname === "/setup") return true;
  return (
    SETUP_GATE_BYPASS.some((prefix) => pathname.startsWith(prefix)) ||
    isWizardDestination(pathname) ||
    SETUP_WIZARD_API_DESTINATIONS[pathname]?.has(method) === true ||
    isSetupOAuthRoute(pathname, method)
  );
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
  return (
    HARD_PAYWALL_WHITELIST.some((p) => pathname.startsWith(p)) ||
    pathname === "/dashboard/subscription" ||
    pathname === "/dashboard/success"
  );
}

// RA-4984 — JWT-claim-driven hard-paywall. The middleware runs in edge
// runtime where Prisma is unavailable, so this reads the subscription
// claims stamped by jwt() in lib/auth.ts. Returns true when the user
// should be blocked. Defense-in-depth only — the API-route subscription
// gate (CLAUDE.md rule #5) remains the authoritative revenue check.
//
// Allowlist (NOT blocked):
//   - lifetimeAccess === true
//   - subscriptionStatus === "ACTIVE"
//   - subscriptionStatus === "TRIAL" AND (trialEndsAt unset OR not expired)
//
// Everything else blocks: TRIAL with expired trialEndsAt, CANCELED,
// EXPIRED, PAST_DUE. Tokens missing the claim entirely (legacy sessions
// from before RA-4984 mint) are treated as allow — they refresh on next
// updateAge tick. This matches the fail-open posture of trial-handling.ts.
function shouldHardPaywall(token: {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  lifetimeAccess?: boolean | null;
}): boolean {
  if (token.lifetimeAccess === true) return false;
  const status = token.subscriptionStatus;
  if (status === "ACTIVE") return false;
  if (status === "TRIAL") {
    if (!token.trialEndsAt) return false;
    const ends = Date.parse(token.trialEndsAt);
    if (Number.isNaN(ends)) return false;
    return Date.now() > ends;
  }
  if (status == null) return false;
  return true;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Compatibility for invitation links issued by the retired signup flow.
  // The public registration endpoint always creates a new ADMIN + organisation,
  // so an invitation token must never be allowed to continue through /signup.
  // Canonical invite acceptance is token-scoped at /invite/[token]. Invalid or
  // duplicated query tokens are sent to the same fail-closed invite surface.
  if (pathname === "/signup" && req.nextUrl.searchParams.has("invite")) {
    const inviteTokens = req.nextUrl.searchParams.getAll("invite");
    const token = inviteTokens.length === 1 ? inviteTokens[0].trim() : "";
    const url = req.nextUrl.clone();
    url.pathname = /^[a-f0-9]{48}$/i.test(token)
      ? `/invite/${token}`
      : "/invite/invalid";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  // DigitalOcean also assigns a public origin hostname. When this deployment
  // explicitly configures ALLOWED_APP_HOSTS, refuse every other Host before
  // auth or rate-limit code runs; otherwise callers could bypass Cloudflare
  // and forge proxy-specific client-IP headers at the origin.
  const allowedHosts = (process.env.ALLOWED_APP_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0) {
    const requestHost = (req.headers.get("host") ?? "")
      .split(":", 1)[0]
      .toLowerCase();
    if (!allowedHosts.includes(requestHost)) {
      return new NextResponse("Misdirected Request", { status: 421 });
    }
  }

  // ── Setup wizard gate — FIRST check, flag-guarded (Phase 6, Task 18) ────────
  // Safety lever: read env at request time so the flag can be toggled without
  // redeploying. If the flag is off, this entire block is completely inert.
  const SETUP_WIZARD_ENABLED = process.env.SETUP_WIZARD_ENABLED === "true";
  if (
    SETUP_WIZARD_ENABLED &&
    !shouldBypassSetupGate(pathname, req.method.toUpperCase())
  ) {
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
    const limited = applyRateLimitEdge(req, {
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
      const isActiveSetupWizardDestination =
        SETUP_WIZARD_ENABLED &&
        !(token as any).setupCompletedAt &&
        isWizardDestination(pathname);
      if (needsOnboarding && !isActiveSetupWizardDestination) {
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding/account-type";
        url.search = "";
        return NextResponse.redirect(url);
      }
      // Onboarded users must continue to the revenue gate below. Returning
      // here would bypass the hard paywall for every nested dashboard route.
    }
  }

  // ── Hard-paywall — JWT-claim driven (RA-4984, restores SP-3 T15) ───────────
  // Defense-in-depth only — the authoritative revenue check is the
  // API-route subscription gate (CLAUDE.md rule #5). Edge-runtime safe:
  // reads subscriptionStatus / trialEndsAt / lifetimeAccess directly
  // from the JWT stamped in lib/auth.ts jwt(); no Prisma call.
  if (requiresLogin(pathname) && !isHardPaywallWhitelisted(pathname)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token && shouldHardPaywall(token as any)) {
      const url = req.nextUrl.clone();
      url.pathname = "/billing/upgrade";
      url.search = "?reason=trial-expired";
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Authenticated surfaces — match BOTH the bare path AND `:path*` so the
    // middleware fires on /dashboard as well as /dashboard/foo. Next.js's
    // path-to-regexp does NOT treat `:path*` as zero-or-more for the
    // top-level segment — `/dashboard/:path*` only matches /dashboard/x,
    // not bare /dashboard. Missing the bare path produced a 3-day prod
    // sign-in loop: OAuth callback redirected to /dashboard, middleware
    // skipped, the page rendered, client-side useSession() saw no session
    // (because the JWT route also wasn't running its gate), and bounced
    // the user back to /login. Repeat indefinitely.
    "/dashboard",
    "/dashboard/:path*",
    "/reports",
    "/reports/:path*",
    "/compliance",
    "/compliance/:path*",
    "/sign",
    "/sign/:path*",
    "/signup",
    "/invite/:path*",
    "/setup",
    "/setup/:path*",
    // RA-1540 — baseline rate-limit on all /api/*. The middleware itself
    // filters to mutation methods; GETs pass through without overhead.
    "/api/:path*",
  ],
};
