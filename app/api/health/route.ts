import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getEnvStatus } from "@/lib/env-check";

const startTime = Date.now();

interface CheckResult {
  status: string;
  latencyMs?: number;
  missing?: readonly string[];
}

// Wave-V: cache the database connectivity probe so 15-min smoke pings,
// uptime monitors, and dashboard polling don't all pay the 1s+ Supabase
// pooler-establishment cost on every request.
//
// TTL is short enough that a sudden DB outage is detected within ~10s
// (acceptable for synthetic monitoring) but long enough that bursty
// traffic (e.g. a status page pinging every second after a deploy)
// doesn't multiply the connection cost.
const DB_CHECK_CACHE_TTL_MS = 10_000;
let cachedDbCheck: { result: CheckResult; expiresAt: number } | null = null;

async function getDatabaseCheck(): Promise<CheckResult> {
  const now = Date.now();
  if (cachedDbCheck && cachedDbCheck.expiresAt > now) {
    return cachedDbCheck.result;
  }

  let result: CheckResult;
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    result = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch {
    result = { status: "error" };
  }

  cachedDbCheck = { result, expiresAt: now + DB_CHECK_CACHE_TTL_MS };
  return result;
}

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute per IP
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    prefix: "health",
  });
  if (rateLimited) return rateLimited;

  const checks: Record<string, CheckResult> = {};

  // 1. Database connectivity check (cached — see DB_CHECK_CACHE_TTL_MS)
  checks.database = await getDatabaseCheck();

  // 2. Env-var presence check.
  // RA-1799 / RA-1801 / RA-1802 / RA-1803 — without surfacing missing
  // webhook secrets here, the only signal was per-request 500s. Now uptime
  // monitoring picks up the missing-secret state on the next health probe.
  const envStatus = getEnvStatus();
  if (envStatus.missingRequired.length > 0) {
    checks.env = { status: "error", missing: envStatus.missingRequired };
  } else if (envStatus.missingRecommended.length > 0) {
    checks.env = { status: "degraded", missing: envStatus.missingRecommended };
  } else {
    checks.env = { status: "ok" };
  }

  // Aggregate. Any error → 503 + degraded. Any degraded but no errors →
  // 200 + degraded (still serving traffic, but operator should look).
  const statuses = Object.values(checks).map((c) => c.status);
  const hasError = statuses.includes("error");
  const hasDegraded = statuses.includes("degraded");
  const overall = hasError || hasDegraded ? "degraded" : "ok";
  const httpStatus = hasError ? 503 : 200;

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - startTime) / 1000),
      version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      checks,
    },
    { status: httpStatus },
  );
}
