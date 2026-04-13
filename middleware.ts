import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Content Security Policy middleware — progressive nonce-based CSP (F15).
 *
 * Generates a per-request nonce and applies it to script-src using the progressive
 * nonce pattern recommended by the Google Web Fundamentals CSP guide:
 *
 *   'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline'
 *
 * Behaviour by CSP level:
 *   Level 1 (legacy browsers): 'unsafe-inline' is honoured — all inline scripts run.
 *   Level 2 (2016+): nonce overrides 'unsafe-inline'; inline scripts need the nonce.
 *     'self' and domain allowlists still cover same-origin external script tags.
 *   Level 3 (modern): 'strict-dynamic' propagates trust from nonce'd scripts to
 *     their dynamically-created children. 'self' and domain allowlists are ignored
 *     (dynamically-injected chunks are trusted instead). 'unsafe-inline' is ignored.
 *
 * Next.js 16 App Router reads the 'x-nonce' request header and applies the nonce
 * to RSC streaming inline scripts automatically, so hydration is not broken.
 * Stripe SDK and Firebase are loaded via @stripe/stripe-js / Firebase JS SDK, which
 * use document.createElement('script') — trusted via 'strict-dynamic'.
 *
 * 'unsafe-eval' is retained for Fabric.js (SketchCanvas / SketchEditor).
 * style-src uses 'unsafe-inline' — inline styles are lower risk and Radix UI /
 * shadcn components apply them extensively.
 */
export function middleware(request: NextRequest) {
  // Generate a fresh nonce for every request — must be unguessable and unique
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspDirectives = [
    "default-src 'self'",
    // Progressive nonce: Level 3 browsers use nonce+strict-dynamic; Level 2 uses nonce+self;
    // Level 1 falls back to unsafe-inline. 'unsafe-eval' retained for Fabric.js.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://*.stripe.com https://*.supabase.co https://storage.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    [
      "connect-src 'self'",
      "https://*.supabase.co",
      "https://*.stripe.com",
      "https://api.anthropic.com",
      "https://api.deepseek.com",
      "https://generativelanguage.googleapis.com",
      "https://*.firebaseapp.com",
      "https://*.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://go.servicem8.com",
      "https://api.servicem8.com",
      "https://login.xero.com",
      "https://identity.xero.com",
      "https://api.xero.com",
      "https://appcenter.intuit.com",
      "https://oauth.platform.intuit.com",
      "https://quickbooks.api.intuit.com",
      "https://secure.myob.com",
      "https://api.myob.com",
      "https://api.ascora.com.au",
    ].join(" "),
    "frame-src 'self' https://*.firebaseapp.com https://*.stripe.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  const csp = cspDirectives.join("; ");

  // Clone the request headers and inject the nonce so Server Components can
  // read it via headers() without relying on client-side access.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set CSP on the response — browsers enforce this header
  response.headers.set("Content-Security-Policy", csp);
  // Expose nonce to edge/middleware consumers
  response.headers.set("x-nonce", nonce);
  // Prevent Vercel/Cloudflare edge from caching HTML responses — CSP includes a
  // per-request nonce so cached responses would serve a stale nonce, and the
  // cached CSP header would block newly-deployed script changes from reaching users.
  response.headers.set("Cache-Control", "no-store, must-revalidate");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files — served by Next.js CDN layer, not middleware)
     * - _next/image (image optimization — Next.js internal)
     * - favicon.ico, robots.txt, sitemap.xml (public static assets)
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
