import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getEnvStatus } from "@/lib/env-check";

const startTime = Date.now();

interface CheckResult {
  status: string;
  latencyMs?: number;
  missing?: readonly string[];
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

  // 1. Database connectivity check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: "error" };
  }

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
