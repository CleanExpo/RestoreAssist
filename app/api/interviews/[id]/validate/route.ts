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
  validateInterviewResponse,
  type ValidationFinding,
} from "@/lib/services/ai/validate-interview-response";
import { apiError } from "@/lib/api-errors";

/**
 * RA-1214 — POST /api/interviews/[id]/validate
 *
 * Uses Claude Haiku to validate a guided interview's answers against
 * IICRC S500:2021 water-damage restoration standards. Returns an
 * advisory-only finding list — does NOT block report generation.
 *
 * Guards:
 *  - getServerSession (Rule 1)
 *  - Subscription allowlist TRIAL/ACTIVE/LIFETIME (Rule 8)
 *  - Rate limit 10/min/user (Rule 10)
 *  - resolveWorkspaceAiKey for the workspace's own BYOK Anthropic key
 *    (RA-6963) — never spends the platform ANTHROPIC_API_KEY
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const MAX_INPUT_ANSWERS = 60;

interface AnsweredQuestionInput {
  questionId?: string;
  questionText?: string;
  answer?: unknown;
}

interface ValidateRequestBody {
  answeredQuestions?: AnsweredQuestionInput[];
}

export type { ValidationFinding } from "@/lib/services/ai/validate-interview-response";

export interface ValidationResponse {
  findings: ValidationFinding[];
  validatedAt: string;
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
    maxRequests: 10,
    prefix: "interview-validate",
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

    let body: ValidateRequestBody;
    try {
      body = (await request.json()) as ValidateRequestBody;
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const answered = Array.isArray(body.answeredQuestions)
      ? body.answeredQuestions.slice(0, MAX_INPUT_ANSWERS)
      : [];

    if (answered.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No answered questions provided",
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

    const result = await validateInterviewResponse({
      apiKey: anthropicApiKey,
      answered,
    });

    if (!result.ok) {
      // RA-1548 — left raw: dynamic status (429/503/500) with a Retry-After
      // header apiError() cannot emit. The final catch below is also left raw
      // (pinned by an exact-shape __tests__ assertion).
      console.error("[interview-validate]", {
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

    return NextResponse.json({
      findings: result.data.findings,
      validatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // RA-786: never leak error.message
    console.error("[interview-validate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
