/**
 * RA-1208: AI-generated "what changed this period" narrative for /dashboard/analytics.
 *
 * GET /api/analytics/narrative?period=month|quarter|year&compareTo=previous
 *
 * Reuses the same period-over-period deltas that power `/api/analytics/insights`
 * (reports, revenue, hazard mix, client movers) and asks Claude Haiku for a
 * plain-English summary in Australian English.
 *
 * Cache: in-memory Map keyed by `${userId}:${period}:${compareTo}` with 1-hour TTL.
 * A DB-backed cache was considered but deferred — narratives are cheap to regenerate
 * (~1-2k input tokens on Haiku ≈ A$0.002) and an in-memory Map keeps the PR surgical.
 * Cold starts will miss the cache but users will still see a response within ~2s.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import { applyRateLimit } from "@/lib/rate-limiter";
import { generateAnalyticsNarrative } from "@/lib/services/ai/analytics-narrative";
import { apiError, fromException } from "@/lib/api-errors";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"] as const;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type Period = "month" | "quarter" | "year";

interface CacheEntry {
  narrative: string;
  generatedAt: string;
  expiresAt: number;
}

// Module-level in-memory cache. Per-serverless-instance; acceptable for a
// 1-hour narrative that users re-render on filter change.
const narrativeCache = new Map<string, CacheEntry>();

function getDateRanges(period: Period) {
  const now = new Date();
  let days: number;
  switch (period) {
    case "month":
      days = 30;
      break;
    case "quarter":
      days = 90;
      break;
    case "year":
      days = 365;
      break;
  }
  const ms = days * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - ms);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - ms);
  return { currentStart, currentEnd: now, previousStart, previousEnd };
}

interface PeriodAggregates {
  reportCount: number;
  revenue: number;
  hazardCounts: Map<string, number>;
  clientRevenue: Map<string, number>;
  suburbCounts: Map<string, number>;
  insurerCounts: Map<string, number>;
}

function aggregate(
  reports: Array<{
    hazardType: string | null;
    clientName: string | null;
    propertyPostcode: string | null;
    insurerName: string | null;
    totalCost: number | null;
    estimates: { totalIncGST: number | null }[];
    client: { name: string | null } | null;
  }>,
): PeriodAggregates {
  const agg: PeriodAggregates = {
    reportCount: reports.length,
    revenue: 0,
    hazardCounts: new Map(),
    clientRevenue: new Map(),
    suburbCounts: new Map(),
    insurerCounts: new Map(),
  };

  for (const r of reports) {
    const rev = r.estimates?.[0]?.totalIncGST ?? r.totalCost ?? 0;
    agg.revenue += rev;

    const hazard = r.hazardType || "Other";
    agg.hazardCounts.set(hazard, (agg.hazardCounts.get(hazard) || 0) + 1);

    const client = r.client?.name || r.clientName || "Unknown";
    agg.clientRevenue.set(client, (agg.clientRevenue.get(client) || 0) + rev);

    if (r.propertyPostcode) {
      agg.suburbCounts.set(
        r.propertyPostcode,
        (agg.suburbCounts.get(r.propertyPostcode) || 0) + 1,
      );
    }
    if (r.insurerName) {
      agg.insurerCounts.set(
        r.insurerName,
        (agg.insurerCounts.get(r.insurerName) || 0) + 1,
      );
    }
  }
  return agg;
}

function pct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function topDeltas(
  current: Map<string, number>,
  previous: Map<string, number>,
  limit = 3,
): Array<{ key: string; current: number; previous: number; delta: number }> {
  const keys = new Set([...current.keys(), ...previous.keys()]);
  return Array.from(keys)
    .map((key) => {
      const c = current.get(key) || 0;
      const p = previous.get(key) || 0;
      return { key, current: c, previous: p, delta: c - p };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;

    // CLAUDE.md rule 10: rate-limit key by userId
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      prefix: "analytics-narrative",
      key: userId,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") || "month") as Period;
    const compareTo = searchParams.get("compareTo") || "previous";

    if (!["month", "quarter", "year"].includes(periodParam)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "period must be month, quarter, or year",
        status: 400,
      });
    }
    if (compareTo !== "previous") {
      return apiError(request, {
        code: "VALIDATION",
        message: "only compareTo=previous is supported",
        status: 400,
      });
    }

    const cacheKey = `${userId}:${periodParam}:${compareTo}`;
    const cached = narrativeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        narrative: cached.narrative,
        generatedAt: cached.generatedAt,
        cacheHit: true,
      });
    }

    // CLAUDE.md rule 8: subscription gate before AI call
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    });
    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        (user.subscriptionStatus ??
          "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
      )
    ) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "Active subscription required",
        status: 402,
      });
    }

    // RA-6963 (BYOK, P1) — resolve the workspace's own Anthropic key; never the
    // platform ANTHROPIC_API_KEY. On no key, return 402 (chatbot sibling
    // pattern). The flat `{ error }` envelope is retained here (not apiError's
    // nested shape) because AINarrativeCard reads `body.error` as a string.
    let anthropicApiKey: string;
    try {
      anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (err instanceof NoWorkspaceKeyError) {
        return NextResponse.json({ error: err.message }, { status: 402 });
      }
      throw err;
    }

    const { currentStart, currentEnd, previousStart, previousEnd } =
      getDateRanges(periodParam);

    const reportSelect = {
      hazardType: true,
      clientName: true,
      propertyPostcode: true,
      insurerName: true,
      totalCost: true,
      estimates: {
        take: 1,
        orderBy: { createdAt: "desc" as const },
        select: { totalIncGST: true },
      },
      client: { select: { name: true } },
    } as const;

    const [currentReports, previousReports] = await Promise.all([
      prisma.report.findMany({
        where: {
          userId,
          createdAt: { gte: currentStart, lte: currentEnd },
        },
        take: 5000, // CLAUDE.md rule 4
        select: reportSelect,
      }),
      prisma.report.findMany({
        where: {
          userId,
          createdAt: { gte: previousStart, lte: previousEnd },
        },
        take: 5000,
        select: reportSelect,
      }),
    ]);

    if (currentReports.length === 0 && previousReports.length === 0) {
      return NextResponse.json({
        narrative:
          "No reports in the selected period yet. Generate your first report to see trends.",
        generatedAt: new Date().toISOString(),
        cacheHit: false,
      });
    }

    const current = aggregate(currentReports);
    const previous = aggregate(previousReports);

    const deltas = {
      period: periodParam,
      reports: {
        current: current.reportCount,
        previous: previous.reportCount,
        changePct: pct(current.reportCount, previous.reportCount),
      },
      revenue: {
        current: Math.round(current.revenue),
        previous: Math.round(previous.revenue),
        changePct: pct(current.revenue, previous.revenue),
      },
      topHazardMovers: topDeltas(current.hazardCounts, previous.hazardCounts),
      topClientMovers: topDeltas(current.clientRevenue, previous.clientRevenue),
      topSuburbMovers: topDeltas(current.suburbCounts, previous.suburbCounts),
      topInsurerMovers: topDeltas(
        current.insurerCounts,
        previous.insurerCounts,
      ),
    };

    const result = await generateAnalyticsNarrative({
      apiKey: anthropicApiKey,
      input: { period: periodParam, deltas },
    });

    if (!result.ok) {
      // RA-1548 — this upstream-AI translation block is intentionally left on
      // raw NextResponse: the 429/503 branches carry Retry-After headers that
      // apiError() cannot emit, and 424/502 have no clean code in the envelope
      // map. Kept cohesive rather than half-migrated.
      console.error("[analytics/narrative]", {
        userId,
        reason: result.reason,
        detail: result.detail,
      });
      if (result.reason === "RATE_LIMITED") {
        return NextResponse.json(
          { error: "Rate limited by AI provider" },
          {
            status: 429,
            headers: {
              "Retry-After": Math.ceil(
                (result.retryAfterMs ?? 30000) / 1000,
              ).toString(),
            },
          },
        );
      }
      if (result.reason === "MODEL_OVERLOADED") {
        return NextResponse.json(
          { error: "AI provider overloaded" },
          {
            status: 503,
            headers: {
              "Retry-After": Math.ceil(
                (result.retryAfterMs ?? 10000) / 1000,
              ).toString(),
            },
          },
        );
      }
      if (result.reason === "PARSE_FAILED") {
        return NextResponse.json(
          { error: "Unable to parse AI response" },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    const generatedAt = new Date().toISOString();
    narrativeCache.set(cacheKey, {
      narrative: result.data.narrative,
      generatedAt,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json({
      narrative: result.data.narrative,
      generatedAt,
      cacheHit: false,
    });
  } catch (error) {
    // CLAUDE.md rule 7: do not leak error.message (fromException emits a
    // generic message; detail goes to reportError only).
    return fromException(request, error, { stage: "narrative" });
  }
}
