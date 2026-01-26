import { NextRequest, NextResponse } from "next/server"

/**
 * Validate CSRF by checking the Origin header matches the Host.
 * Returns a 403 response if validation fails, or null if valid.
 *
 * NextAuth SameSite=Lax cookies provide primary CSRF defense for
 * authenticated routes. This utility adds defense-in-depth for
 * public-facing state-changing endpoints.
 */
export function validateCsrf(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase()
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null

  const origin = req.headers.get("origin")
  const host = req.headers.get("host")

  // Allow requests without Origin (same-origin form submissions, curl, etc.)
  // Primary defense is SameSite cookies; this is supplementary
  if (!origin) return null

  if (!host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      console.warn(`[CSRF] Origin mismatch: ${originHost} !== ${host}`)
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      )
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}
