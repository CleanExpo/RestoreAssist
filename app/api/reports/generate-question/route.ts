import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { generateInterviewQuestion } from "@/lib/services/ai/generate-interview-question";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    prefix: "gen-question",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: question generation hits Anthropic (or user's BYOK) —
  // retry doubles the AI spend.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { conversation } = body;

      if (
        !conversation ||
        !Array.isArray(conversation) ||
        conversation.length === 0
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Conversation is required",
          status: 400,
        });
      }

      const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, subscriptionStatus: true },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      if (
        !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Active subscription required",
          status: 402,
        });
      }

      // Get appropriate API key based on subscription status
      // Free users: uses ANTHROPIC_API_KEY from .env
      // Upgraded users: uses API key from integrations
      let anthropicApiKey: string;
      try {
        anthropicApiKey = await getAnthropicApiKey(userId);
      } catch (error: any) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Failed to get Anthropic API key",
          status: 400,
        });
      }

      const conversationHistory = conversation.map((msg: any) => ({
        role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }));

      const result = await generateInterviewQuestion({
        apiKey: anthropicApiKey,
        conversation: conversationHistory,
      });

      if (!result.ok) {
        console.error("[generate-question]", {
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
          {
            error:
              result.reason === "RATE_LIMITED" ||
              result.reason === "MODEL_OVERLOADED"
                ? "AI service is temporarily unavailable. Please try again."
                : "Failed to generate question. Please check your API key and try again.",
          },
          { status, headers },
        );
      }

      return NextResponse.json({
        question: result.data.question,
        isComplete: result.data.isComplete,
        integrationUsed: "Anthropic API",
      });
    } catch (error: any) {
      return fromException(request, error, { stage: "generate-question" });
    }
  });
}
