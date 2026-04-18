import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter — Upstash Redis when configured, in-memory fallback otherwise.
 *
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars to
 * enable the persistent, cross-process rate limiter. Without these vars the
 * in-memory fallback is used (resets on serverless cold starts — acceptable
 * for development, not for production).
 */

// ─── Upstash Redis path ───────────────────────────────────────────────────────

let _upstashRatelimit: any = null;

async function getUpstashRatelimit(windowMs: number, maxRequests: number) {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dep; installed in production, may be absent locally
    const { Ratelimit } = await import("@upstash/ratelimit");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { Redis } = await import("@upstash/redis");

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        maxRequests,
        `${Math.round(windowMs / 1000)} s`,
      ),
      analytics: false,
    });
  } catch {
    // Package not installed or Redis unreachable — fall back to in-memory
    return null;
  }
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

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

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/** Low-level rate limit check (in-memory only). Use applyRateLimit for routes. */
export function rateLimit(
  key: string,
  opts: { windowMs: number; maxRequests: number },
): RateLimitResult {
  return rateLimitInMemory(key, opts);
}

/**
 * Apply rate limiting to a route handler request.
 * Returns a 429 NextResponse if the limit is exceeded, or null if allowed.
 *
 * Uses Upstash Redis sliding window when UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are set; falls back to in-memory otherwise.
 */
export async function applyRateLimit(
  req: NextRequest,
  opts: {
    windowMs?: number;
    maxRequests?: number;
    prefix?: string;
    key?: string;
    /**
     * RA-1319: when true, an Upstash outage returns 429 instead of falling
     * back to in-memory. Use on AI-cost-sensitive endpoints where the
     * per-instance in-memory cap multiplied by cold-start instance count
     * would blow the Anthropic budget.
     */
    failClosedOnUpstashError?: boolean;
  } = {},
): Promise<NextResponse | null> {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 5,
    prefix = "api",
    key: customKey,
    failClosedOnUpstashError = false,
  } = opts;
  const rateLimitKey = customKey
    ? `${prefix}:${customKey}`
    : `${prefix}:${getClientIp(req)}`;

  // Try Upstash first
  const limiter = await getUpstashRatelimit(windowMs, maxRequests);
  if (limiter) {
    try {
      const { success, remaining, reset } = await limiter.limit(rateLimitKey);
      if (!success) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((reset - Date.now()) / 1000),
        );
        return build429(maxRequests, retryAfterSec);
      }
      return null;
    } catch {
      // Redis error — fall through to in-memory unless caller opted in to fail-closed
      console.warn(
        "[rate-limiter] Upstash Redis error, falling back to in-memory",
      );
      if (failClosedOnUpstashError) {
        return build429(maxRequests, 60);
      }
    }
  }

  // In-memory fallback
  const result = rateLimitInMemory(rateLimitKey, { windowMs, maxRequests });
  if (!result.success) {
    const retryAfterSec = Math.ceil((result.retryAfterMs || 0) / 1000);
    return build429(maxRequests, retryAfterSec);
  }

  return null;
}
