import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  suggestNextInterviewQuestion,
  type AnsweredQuestion,
  type RemainingQuestion,
} from "@/lib/services/ai/suggest-next-interview-question";
import { apiError } from "@/lib/api-errors";

/**
 * RA-1199 — POST /api/interviews/[id]/suggest-next
 *
 * Uses Claude Haiku to propose ONE targeted follow-up question based on the
 * interview's answered questions, avoiding duplicates of remaining template
 * questions. Returns `{ question, reasoning }` or `{ question: null, reason }`
 * when nothing meaningful is left to ask.
 *
 * Guards:
 *  - getServerSession (Rule 1)
 *  - Subscription allowlist TRIAL/ACTIVE/LIFETIME (Rule 8)
 *  - Rate limit 30/min/user (Rule 10)
 *  - Requires 3+ answered questions (ticket requirement)
 *  - resolveWorkspaceAiKey for the workspace's own BYOK Anthropic key
 *    (RA-6963) — never spends the platform ANTHROPIC_API_KEY
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const MIN_ANSWERS_REQUIRED = 3;

interface SuggestRequestBody {
  answeredQuestions?: AnsweredQuestion[];
  remainingQuestions?: RemainingQuestion[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    prefix: "interview-suggest-next",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  try {
    const { id } = await params;
    if (!id) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Interview ID is required",
        status: 400,
      });
    }

    // Parse body
    let body: SuggestRequestBody;
    try {
      body = (await request.json()) as SuggestRequestBody;
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const answered = Array.isArray(body.answeredQuestions)
      ? body.answeredQuestions
      : [];
    const remaining = Array.isArray(body.remainingQuestions)
      ? body.remainingQuestions
      : [];

    if (answered.length < MIN_ANSWERS_REQUIRED) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Need at least ${MIN_ANSWERS_REQUIRED} answered questions before requesting a suggestion`,
        status: 400,
      });
    }

    // Verify session ownership + subscription
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
        code: "PAYMENT_REQUIRED",
        message: "Active subscription required",
        status: 402,
      });
    }

    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!interviewSession) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Interview session not found",
        status: 404,
      });
    }

    // RA-6963 (BYOK, P1) — resolve the workspace's own Anthropic key; never the
    // platform ANTHROPIC_API_KEY. On no key, return the 402 NoWorkspaceKeyError
    // shape (chatbot sibling pattern).
    let anthropicApiKey: string;
    try {
      anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (err instanceof NoWorkspaceKeyError) {
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message: err.message,
          status: 402,
        });
      }
      throw err;
    }

    const result = await suggestNextInterviewQuestion({
      apiKey: anthropicApiKey,
      answered,
      remaining,
    });

    if (!result.ok) {
      // RA-1548 — left raw: dynamic status (429/503/500) with a Retry-After
      // header apiError() cannot emit. The final catch below is also left raw
      // (pinned by an exact-shape __tests__ assertion).
      console.error("[suggest-next]", {
        interviewId: id,
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
        { error: "Internal server error" },
        { status, headers },
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    // RA-786: never leak error.message
    console.error("[suggest-next] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
