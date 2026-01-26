import { NextRequest, NextResponse } from "next/server"

/**
 * Sliding window in-memory rate limiter.
 * Tracks request timestamps per key (IP address).
 */

const store = new Map<string, number[]>()

// Cleanup stale entries every 60 seconds
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup(windowMs: number) {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((t) => now - t < windowMs)
      if (valid.length === 0) {
        store.delete(key)
      } else {
        store.set(key, valid)
      }
    }
  }, 60_000)
  // Allow process to exit without waiting for the timer
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref()
  }
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  retryAfterMs?: number
}

export function rateLimit(
  key: string,
  opts: { windowMs: number; maxRequests: number }
): RateLimitResult {
  ensureCleanup(opts.windowMs)
  const now = Date.now()
  const timestamps = (store.get(key) || []).filter(
    (t) => now - t < opts.windowMs
  )

  if (timestamps.length >= opts.maxRequests) {
    const oldestInWindow = timestamps[0]
    const retryAfterMs = opts.windowMs - (now - oldestInWindow)
    return { success: false, remaining: 0, retryAfterMs }
  }

  timestamps.push(now)
  store.set(key, timestamps)
  return { success: true, remaining: opts.maxRequests - timestamps.length }
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * Apply rate limiting to a request. Returns a 429 response if exceeded, or null if allowed.
 */
export function applyRateLimit(
  req: NextRequest,
  opts: { windowMs?: number; maxRequests?: number; prefix?: string } = {}
): NextResponse | null {
  const { windowMs = 15 * 60 * 1000, maxRequests = 5, prefix = "api" } = opts
  const ip = getClientIp(req)
  const key = `${prefix}:${ip}`
  const result = rateLimit(key, { windowMs, maxRequests })

  if (!result.success) {
    const retryAfterSec = Math.ceil((result.retryAfterMs || 0) / 1000)
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  return null
}
