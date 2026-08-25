import { NextRequest, NextResponse } from "next/server";

/**
 * Validate CSRF by checking the Origin header matches the Host.
 * Returns a 403 response if validation fails, or null if valid.
 *
 * NextAuth SameSite=Lax cookies provide primary CSRF defense for
 * authenticated routes. This utility adds defense-in-depth for
 * public-facing state-changing endpoints.
 */
export function validateCsrf(
  req: NextRequest,
  options: { requireOrigin?: boolean } = {},
): NextResponse | null {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // Allow requests without Origin (same-origin form submissions, curl, etc.)
  // Primary defense is SameSite cookies; this is supplementary
  if (!origin) {
    return options.requireOrigin
      ? NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
      : null;
  }

  if (!host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    if (
      originHost !== host ||
      originUrl.protocol !== req.nextUrl.protocol ||
      !["http:", "https:"].includes(originUrl.protocol)
    ) {
      console.warn(
        `[CSRF] Origin mismatch: ${originUrl.origin} !== ${req.nextUrl.origin}`,
      );
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
