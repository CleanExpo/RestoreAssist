import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * In-memory fallback rate limiter — sliding window per key.
 * Route handlers should use applyRateLimit, which persists hits in Prisma.
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
 * Use only the platform-appended final XFF entry. cf-connecting-ip is
 * deliberately ignored here: DigitalOcean's direct origin remains reachable,
 * where a client can forge that header and rotate rate-limit keys.
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
        "Retry-After": String(Math.max(1, retryAfterSec)),
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

function build503DatabaseUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Database is unreachable (connection refused). Start Postgres on DATABASE_URL and retry.",
      code: "DATABASE_UNAVAILABLE",
    },
    { status: 503 },
  );
}

function isDatabaseConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; name?: string };
  if (e.code === "ECONNREFUSED" || e.code === "P1001" || e.code === "P1017") {
    return true;
  }
  const msg = `${e.message ?? ""} ${e.name ?? ""}`;
  return /ECONNREFUSED|Can't reach database|P1001|P1017/i.test(msg);
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs?: number;
}

async function rateLimitDurable(
  key: string,
  opts: { windowMs: number; maxRequests: number },
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - opts.windowMs);
  const expiresAt = new Date(now.getTime() + opts.windowMs);

  await prisma.rateLimitHit.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  return prisma.$transaction(async (tx) => {
    const hit = await tx.rateLimitHit.create({
      data: { key, expiresAt },
      select: { id: true },
    });

    const count = await tx.rateLimitHit.count({
      where: {
        key,
        createdAt: { gte: windowStart },
      },
    });

    if (count <= opts.maxRequests) {
      return { success: true, remaining: opts.maxRequests - count };
    }

    await tx.rateLimitHit.delete({ where: { id: hit.id } });
    const oldestInWindow = await tx.rateLimitHit.findFirst({
      where: {
        key,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const retryAfterMs = oldestInWindow
      ? Math.max(
          0,
          opts.windowMs - (now.getTime() - oldestInWindow.createdAt.getTime()),
        )
      : opts.windowMs;

    return { success: false, remaining: 0, retryAfterMs };
  });
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
    /** When true, limiter store failures return 429 instead of falling back. */
    failClosedOnUpstashError?: boolean;
    /**
     * Skip Prisma entirely and rate-limit in process memory.
     * Use for unauthenticated public surfaces where a local DB outage
     * must not block the product (e.g. marketing Margot chat).
     */
    memoryOnly?: boolean;
  } = {},
): Promise<NextResponse | null> {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 5,
    prefix = "api",
    key: customKey,
    failClosedOnUpstashError = false,
    memoryOnly = false,
  } = opts;

  const rateLimitKey = customKey
    ? `${prefix}:${customKey}`
    : `${prefix}:${getClientIp(req)}`;

  let result: RateLimitResult;
  if (memoryOnly) {
    result = rateLimitInMemory(rateLimitKey, { windowMs, maxRequests });
  } else {
    try {
      result = await rateLimitDurable(rateLimitKey, { windowMs, maxRequests });
    } catch (error) {
      console.error("[rate-limit] durable limiter unavailable", error);
      // DB down is not "too many requests" — surface a 503 so local/dev
      // operators fix Postgres instead of chasing a fake rate limit.
      if (isDatabaseConnectivityError(error)) {
        return build503DatabaseUnavailable();
      }
      if (failClosedOnUpstashError) {
        return build429(maxRequests, Math.ceil(windowMs / 1000));
      }
      // Fail open: keep serving with the in-memory limiter.
      result = rateLimitInMemory(rateLimitKey, { windowMs, maxRequests });
    }
  }

  if (!result.success) {
    const retryAfterSec = Math.ceil((result.retryAfterMs || 0) / 1000);
    return build429(maxRequests, retryAfterSec);
  }

  return null;
}

/** Test-only: clear durable and fallback rate-limit state. */
export async function __resetRateLimitStore(): Promise<void> {
  store.clear();
  await prisma.rateLimitHit.deleteMany();
}
