import { NextRequest, NextResponse } from "next/server";

/**
 * Edge-safe rate limiter — sliding window per key, in-memory only.
 *
 * Next.js middleware ALWAYS runs on the Edge runtime, where the standard
 * Prisma Client cannot run (PrismaClientValidationError: "In order to run
 * Prisma Client on edge runtime"). The durable limiter in
 * `lib/rate-limiter.ts` imports `@/lib/prisma` at module scope, so importing
 * it from middleware pulled PrismaClient into the edge bundle and threw on
 * every limited request (the "[rate-limit] durable limiter" prod error).
 *
 * This module has NO Prisma import — it is the in-memory baseline cap the
 * middleware applies before the request reaches the (serverless) route
 * handler, where the authoritative durable limiter still runs on top.
 */

const store = new Map<string, number[]>();

function rateLimitInMemory(
  key: string,
  opts: { windowMs: number; maxRequests: number },
): { success: boolean; remaining: number; retryAfterMs?: number } {
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

/**
 * Edge-safe rate limit for the middleware baseline cap. Returns a 429
 * NextResponse if the limit is exceeded, or null if the request is allowed.
 */
export function applyRateLimitEdge(
  req: NextRequest,
  opts: {
    windowMs?: number;
    maxRequests?: number;
    prefix?: string;
    key?: string;
  } = {},
): NextResponse | null {
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
