import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getAnthropicApiKey } from "@/lib/ai-provider";

/**
 * RA-1192: POST /api/reports/[id]/synopsis
 *
 * Generates an AI one-line synopsis (<= 20 words, Australian English) for a
 * single report row on /dashboard/reports. Uses Claude Haiku for cost, persists
 * to Report.aiSynopsis and caches for 24 hours to bound per-user spend.
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

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
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
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

    // Resolve an API key. Prefer user's connected Anthropic integration; fall
    // back to the platform ANTHROPIC_API_KEY env var if present. If neither is
    // available, return a helpful 400 per ticket spec.
    let apiKey: string | null = null;
    try {
      apiKey = await getAnthropicApiKey(userId);
    } catch {
      apiKey = process.env.ANTHROPIC_API_KEY || null;
    }
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Connect an AI integration first. Add your Anthropic API key in Settings → Integrations to generate AI summaries.",
        },
        { status: 400 },
      );
    }

    const totalCost =
      report.estimates?.[0]?.totalIncGST ?? report.totalCost ?? null;
    const facts = [
      report.waterCategory ? `Water ${report.waterCategory}` : null,
      report.waterClass ? `Class ${report.waterClass}` : null,
      report.hazardType ? `Hazard: ${report.hazardType}` : null,
      report.affectedArea ? `Affected area: ${report.affectedArea} m²` : null,
      report.estimatedDryingTime
        ? `Drying: ${report.estimatedDryingTime} hours`
        : null,
      totalCost != null
        ? `Total: AUD $${Number(totalCost).toLocaleString()}`
        : null,
      report.propertyAddress ? `Property: ${report.propertyAddress}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Summarise this water damage restoration report in ONE sentence (max 20 words). Include water category, affected area, drying duration, and total cost. Australian English. Plain text, no quotes.\n\n${facts}`;

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 60,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const first = response.content[0];
    if (!first || first.type !== "text") {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
    const synopsis = first.text
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 280);

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
    console.error("[reports/synopsis] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
