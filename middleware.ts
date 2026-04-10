import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Content Security Policy middleware.
 *
 * Generates a per-request nonce and forwards it as 'x-nonce' so Server Components
 * can read it via headers(). The nonce is NOT injected into script-src because
 * Next.js App Router script tags don't carry the nonce attribute — using
 * 'strict-dynamic' + nonce with unnonce'd script tags would block all JS.
 *
 * script-src uses 'self' to allow same-origin Next.js chunks plus the explicit
 * external allowlist below. 'unsafe-eval' is retained for Fabric.js/Firebase SDK.
 *
 * style-src uses 'unsafe-inline' — inline styles are lower risk and Radix UI /
 * shadcn components apply them extensively.
 */
export function middleware(request: NextRequest) {
  // Generate a fresh nonce for every request — must be unguessable and unique
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspDirectives = [
    "default-src 'self'",
    // 'self' allows same-origin Next.js chunks; 'unsafe-eval' retained for Fabric.js/Firebase.
    // Note: 'strict-dynamic' is intentionally omitted — when present it ignores 'self', which
    // breaks Next.js hydration because the framework's script tags don't carry the nonce.
    `script-src 'self' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://js.stripe.com`,
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
