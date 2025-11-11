import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Multi-Tenant Middleware
 *
 * Extracts tenant identifier from subdomain and sets x-tenant header
 * for use throughout the application.
 *
 * Subdomain Mapping:
 * - allied.restoreassist.app → tenant: "allied"
 * - cleardry.restoreassist.app → tenant: "cleardry"
 * - restoreassist.app → tenant: "default"
 * - localhost:3001 → tenant: "default"
 *
 * The x-tenant header can be read in API routes:
 * const tenant = req.headers.get("x-tenant");
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";

  // Extract subdomain from host
  const parts = host.split(".");

  // Determine tenant based on subdomain
  let tenant = "default";

  // Handle localhost and IP addresses (development)
  if (host.includes("localhost") || host.match(/^\d+\.\d+\.\d+\.\d+/)) {
    tenant = "default";
  }
  // Handle subdomains (production/staging)
  else if (parts.length >= 3) {
    // Extract subdomain (first part)
    const subdomain = parts[0];

    // Ignore common patterns that aren't tenants
    const ignoredSubdomains = ["www", "api", "admin", "staging", "dev"];

    if (!ignoredSubdomains.includes(subdomain)) {
      tenant = subdomain;
    }
  }

  // Clone response and set tenant header
  const response = NextResponse.next();
  response.headers.set("x-tenant", tenant);

  // Optional: Add tenant to cookies for client-side access
  response.cookies.set("x-tenant", tenant, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  return response;
}

/**
 * Matcher Configuration
 *
 * Apply middleware to all routes except static assets and Next.js internals
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
