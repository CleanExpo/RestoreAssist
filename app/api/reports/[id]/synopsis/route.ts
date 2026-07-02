import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getLatestAIIntegration } from "@/lib/ai-provider";
import { generateReportSynopsis } from "@/lib/services/ai/report-synopsis";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

/**
 * RA-1192: POST /api/reports/[id]/synopsis
 *
 * Generates an AI one-line synopsis (<= 20 words, Australian English) for a
 * single report row on /dashboard/reports. Uses Claude Haiku for cost, persists
 * to Report.aiSynopsis and caches for 24 hours to bound per-user spend.
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;

    // CLAUDE.md rule 10 — rate-limit on session.user.id, not IP.
    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      prefix: "reports-synopsis",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    // CLAUDE.md rule 8 — subscription gate before any AI call.
    const subUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    });
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(subUser?.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        {
          error: "Active subscription required to generate AI summaries",
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }

    // Ownership check + fetch the fields we'll summarise.
    const report = await prisma.report.findFirst({
      where: { id, userId },
      select: {
        id: true,
        clientName: true,
        propertyAddress: true,
        waterCategory: true,
        waterClass: true,
        affectedArea: true,
        estimatedDryingTime: true,
        totalCost: true,
        hazardType: true,
        aiSynopsis: true,
        aiSynopsisAt: true,
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { totalIncGST: true },
        },
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Idempotent cache: return the existing synopsis if it's < 24h old.
    if (
      report.aiSynopsis &&
      report.aiSynopsisAt &&
      Date.now() - report.aiSynopsisAt.getTime() < CACHE_WINDOW_MS
    ) {
      return NextResponse.json({
        data: {
          aiSynopsis: report.aiSynopsis,
          aiSynopsisAt: report.aiSynopsisAt.toISOString(),
          cached: true,
        },
      });
    }

    // RA-6921 (P0) — resolve an API key. Prefer the new workspace BYOK key;
    // fall back to a legacy Settings -> Integrations Anthropic key for users
    // who configured BYOK before the workspace model existed. Never falls
    // through to the platform ANTHROPIC_API_KEY env var — that was the
    // platform-spend leak this ticket closes. If neither exists, return a
    // helpful 400 per ticket spec.
    let apiKey: string | null = null;
    try {
      apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (!(err instanceof NoWorkspaceKeyError)) throw err;
      const legacyIntegration = await getLatestAIIntegration(userId);
      if (legacyIntegration?.provider === "anthropic") {
        apiKey = legacyIntegration.apiKey;
      }
    }
    if (!apiKey) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Connect an AI integration first. Add your Anthropic API key in Settings → Integrations to generate AI summaries.",
        status: 400,
      });
    }

    const totalCost =
      report.estimates?.[0]?.totalIncGST ?? report.totalCost ?? null;

    const result = await generateReportSynopsis({
      apiKey,
      facts: {
        waterCategory: report.waterCategory,
        waterClass: report.waterClass,
        hazardType: report.hazardType,
        affectedArea: report.affectedArea,
        estimatedDryingTime: report.estimatedDryingTime,
        totalCost: totalCost != null ? Number(totalCost) : null,
        propertyAddress: report.propertyAddress,
      },
    });

    if (!result.ok) {
      console.error("[reports/synopsis]", {
        reportId: report.id,
        userId,
        reason: result.reason,
        detail: result.detail,
      });
      const status =
        result.reason === "RATE_LIMITED"
          ? 429
          : result.reason === "MODEL_OVERLOADED"
            ? 503
            : 500;
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json(
        { error: result.reason },
        { status, headers },
      );
    }

    const synopsis = result.data;

    const now = new Date();
    await prisma.report.update({
      where: { id: report.id },
      data: { aiSynopsis: synopsis, aiSynopsisAt: now },
    });

    return NextResponse.json({
      data: {
        aiSynopsis: synopsis,
        aiSynopsisAt: now.toISOString(),
        cached: false,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "report-synopsis" });
  }
}
