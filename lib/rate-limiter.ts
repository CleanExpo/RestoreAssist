import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory rate limiter — sliding window per key.
 * Resets on serverless cold starts (acceptable at current scale).
 * No external dependencies required.
 */

const store = new Map<string, number[]>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(windowMs: number) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }, 60_000);
  if (
    cleanupTimer &&
    typeof cleanupTimer === "object" &&
    "unref" in cleanupTimer
  ) {
    cleanupTimer.unref();
  }
}

function rateLimitInMemory(
  key: string,
  opts: { windowMs: number; maxRequests: number },
): { success: boolean; remaining: number; retryAfterMs?: number } {
  ensureCleanup(opts.windowMs);
  const now = Date.now();
  const timestamps = (store.get(key) || []).filter(
    (t) => now - t < opts.windowMs,
  );

  if (timestamps.length >= opts.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = opts.windowMs - (now - oldestInWindow);
    return { success: false, remaining: 0, retryAfterMs };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { success: true, remaining: opts.maxRequests - timestamps.length };
}

/**
 * Extract client IP from request headers.
 *
 * On Vercel, the platform appends the true client IP as the LAST entry in
 * x-forwarded-for, making it the only value that cannot be spoofed by the
 * client sending a crafted X-Forwarded-For header.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const lastIp = ips[ips.length - 1];
    if (lastIp) return lastIp;
  }
  return req.headers.get("x-real-ip") || "unknown";
}

function build429(maxRequests: number, retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/** Low-level rate limit check. Use applyRateLimit for route handlers. */
export function rateLimit(
  key: string,
  opts: { windowMs: number; maxRequests: number },
): RateLimitResult {
  return rateLimitInMemory(key, opts);
}

/**
 * Apply rate limiting to a route handler request.
 * Returns a 429 NextResponse if the limit is exceeded, or null if allowed.
 */
export async function applyRateLimit(
  req: NextRequest,
  opts: {
    windowMs?: number;
    maxRequests?: number;
    prefix?: string;
    key?: string;
    /** Kept for API compatibility — has no effect (no external rate limiter). */
    failClosedOnUpstashError?: boolean;
  } = {},
): Promise<NextResponse | null> {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 5,
    prefix = "api",
    key: customKey,
  } = opts;

  const rateLimitKey = customKey
    ? `${prefix}:${customKey}`
    : `${prefix}:${getClientIp(req)}`;

  const result = rateLimitInMemory(rateLimitKey, { windowMs, maxRequests });
  if (!result.success) {
    const retryAfterSec = Math.ceil((result.retryAfterMs || 0) / 1000);
    return build429(maxRequests, retryAfterSec);
  }

  return null;
}
