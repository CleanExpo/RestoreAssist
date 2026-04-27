import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import {
  generateClientSummary,
  type ClientSummaryInput,
} from "@/lib/ai/client-summary";

/**
 * RA-1461: POST /api/reports/[id]/client-summary
 *
 * Generates a ≤160-word plain-English, client-facing summary of a damage
 * report using Claude Haiku 4.5. Addresses the property owner as "you",
 * cites the relevant IICRC standard (e.g. "S500:7.2"), and ends with
 * "What this means for you:" followed by 1–2 sentences.
 *
 * Per-report rate limit: 1 call / 5 minutes (shared cache window).
 * Subscription-gated (rule 8) + atomic credit deduction (rule 9).
 * Cached in Report.clientSummaryCache, invalidated when scope changes.
 *
 * Query/body:
 *   - ?refresh=1 forces regeneration even within the 5-minute window.
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const CACHE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await params;

    // Rule 10 — rate-limit on session.user.id, not IP.
    // Per-endpoint cap protects against runaway loops; the per-report
    // 5-minute cache (below) is the ticket's stated "1 gen per job per 5 min".
    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "reports-client-summary",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    // Rule 8 — subscription gate before any AI call.
    const subUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    });
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(subUser?.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        {
          error: "Active subscription required to generate client summaries",
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
        propertyAddress: true,
        hazardType: true,
        waterCategory: true,
        waterClass: true,
        affectedArea: true,
        estimatedDryingTime: true,
        sourceOfWater: true,
        safetyHazards: true,
        biologicalMouldDetected: true,
        scopeOfWorksDocument: true,
        clientSummaryCache: true,
        clientSummaryCachedAt: true,
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    // 5-minute per-report cache. Satisfies the ticket's "1 generation per
    // job per 5 minutes" rule and avoids burning credits on every page load.
    if (
      !forceRefresh &&
      report.clientSummaryCache &&
      report.clientSummaryCachedAt &&
      Date.now() - report.clientSummaryCachedAt.getTime() < CACHE_WINDOW_MS
    ) {
      return NextResponse.json({
        data: {
          summary: report.clientSummaryCache,
          cachedAt: report.clientSummaryCachedAt.toISOString(),
          cached: true,
        },
      });
    }

    // Rule 9 — atomic credit deduction for TRIAL users.
    // ACTIVE/LIFETIME users are not charged per-summary (same pattern as
    // the rest of the AI endpoints in this repo).
    if (subUser?.subscriptionStatus === "TRIAL") {
      const result = await prisma.user.updateMany({
        where: { id: userId, creditsRemaining: { gte: 1 } },
        data: {
          creditsRemaining: { decrement: 1 },
          totalCreditsUsed: { increment: 1 },
        },
      });
      if (result.count === 0) {
        return NextResponse.json(
          {
            error: "Insufficient credits. Upgrade your plan to continue.",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }
    }

    // Resolve BYOK Anthropic key.
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey(userId);
    } catch {
      return NextResponse.json(
        {
          error:
            "Connect an AI integration first. Add your Anthropic API key in Settings → Integrations to generate summaries.",
        },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const input: ClientSummaryInput = {
      reportId: report.id,
      propertyAddress: report.propertyAddress,
      hazardType: report.hazardType,
      waterCategory: report.waterCategory,
      waterClass: report.waterClass,
      affectedArea: report.affectedArea,
      estimatedDryingTime: report.estimatedDryingTime,
      sourceOfWater: report.sourceOfWater,
      safetyHazards: report.safetyHazards,
      biologicalMouldDetected: report.biologicalMouldDetected,
      scopeOfWorks: report.scopeOfWorksDocument,
    };

    const result = await generateClientSummary(anthropic, input);

    const now = new Date();
    await prisma.report.update({
      where: { id: report.id },
      data: {
        clientSummaryCache: result.summary,
        clientSummaryCachedAt: now,
      },
    });

    return NextResponse.json({
      data: {
        summary: result.summary,
        cachedAt: now.toISOString(),
        cached: false,
        fellBack: result.fellBack,
        attempts: result.attempts,
      },
    });
  } catch (error) {
    // Rule 7 — never expose error.message in 500 responses.
    console.error("[reports/client-summary] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
