/**
 * POST /api/margot/hermes-proxy — RA-1630 Tier 2
 * Margot chat with Nexus Hub context bundle (wiki + brand + memory summary).
 * Uses Claude via Vercel; enriches system prompt from content/nexus-hub + optional Hermes API.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-errors";
import { rateLimit } from "@/lib/bulk-operations";
import { prisma } from "@/lib/prisma";
import {
  estimateCostUsd,
  logAiUsage,
} from "@/lib/usage/log-usage";
import {
  formatNexusContextForPrompt,
  loadNexusContextBundle,
  nexusContextEnabled,
} from "@/lib/nexus-hub-context";

export const runtime = "nodejs";
export const maxDuration = 60;

const HERMES_PROXY_BASE = `You are Margot with Unite-Group Nexus Hub context loaded. Follow voice and ICP below for content tasks.`;
const HERMES_PROXY_MODEL = "claude-sonnet-4-6";
const AI_ALLOWED_STATUSES = new Set(["TRIAL", "ACTIVE", "LIFETIME"]);

async function getPrimaryWorkspace(userId: string) {
  const ownedWorkspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (ownedWorkspace) return { workspaceId: ownedWorkspace.id };

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true, workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  if (membership) {
    return { workspaceId: membership.workspaceId, memberId: membership.id };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const userId = auth.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        lifetimeAccess: true,
      },
    });
    const status = user?.lifetimeAccess
      ? "LIFETIME"
      : (user?.subscriptionStatus ?? "");
    if (!AI_ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    const limited = rateLimit(userId, "margot-hermes-proxy");
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: limited.retryAfter },
        { status: 429 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: "Margot Hermes proxy offline — ANTHROPIC_API_KEY not configured",
        status: 503,
        stage: "config",
      });
    }

    const body = (await request.json()) as { messages?: UIMessage[] };
    const messages = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "messages array required",
        status: 400,
      });
    }

    let system = HERMES_PROXY_BASE;
    if (nexusContextEnabled()) {
      const bundle = await loadNexusContextBundle();
      system = `${HERMES_PROXY_BASE}\n\n${formatNexusContextForPrompt(bundle)}`;
    }

    const startedAt = Date.now();
    const usageTarget = await getPrimaryWorkspace(userId);
    if (usageTarget) {
      logAiUsage({
        workspaceId: usageTarget.workspaceId,
        memberId: usageTarget.memberId,
        provider: "ANTHROPIC",
        model: HERMES_PROXY_MODEL,
        taskType: "margot_hermes_proxy",
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: estimateCostUsd(
          "ANTHROPIC",
          HERMES_PROXY_MODEL,
          0,
          0,
        ),
        latencyMs: Date.now() - startedAt,
        success: true,
        metadata: {
          route: "/api/margot/hermes-proxy",
          metering: "request_start",
          userId,
        },
      });
    }

    const result = streamText({
      model: anthropic(HERMES_PROXY_MODEL),
      system,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Margot Hermes proxy failed",
      status: 500,
      err,
      stage: "stream",
    });
  }
}
