import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per-request nonce-based Content Security Policy.
 *
 * Generates a fresh cryptographic nonce on every request and injects it into
 * script-src. This replaces the static 'unsafe-inline' directive for scripts,
 * preventing XSS payloads from executing even if an attacker injects a script
 * tag (they cannot know the nonce value ahead of time).
 *
 * Note: 'unsafe-eval' is retained for Fabric.js (sketch editor) and Firebase SDK,
 * both of which require new Function() / eval() in the browser.
 *
 * Note: 'unsafe-inline' is retained in style-src only — inline styles are lower risk
 * and Radix UI / shadcn components apply them extensively.
 *
 * To consume the nonce in a Server Component:
 *   import { headers } from 'next/headers'
 *   const nonce = (await headers()).get('x-nonce') ?? ''
 */
export function middleware(request: NextRequest) {
  // Generate a fresh nonce for every request — must be unguessable and unique
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspDirectives = [
    "default-src 'self'",
    // 'strict-dynamic' trusts scripts loaded by nonce-bearing scripts (Next.js chunk loading)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://js.stripe.com`,
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
