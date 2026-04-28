/**
 * Interview Completion Tracking API
 * POST /api/forms/interview/complete
 * Track interview completion metrics and auto-population statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InterviewAnalyticsService } from "@/lib/forms/analytics";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

interface CompletionRequest {
  sessionId: string;
  autoPopulatedFieldsCount: number;
  averageConfidence: number;
  conflictCount: number;
}

/**
 * POST /api/forms/interview/complete
 * Track interview completion and analytics
 */
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

  // RA-1266: completion tracking writes analytics rows — prevent double
  // tracking on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: CompletionRequest;
      try {
        body = (rawBody ? JSON.parse(rawBody) : {}) as CompletionRequest;
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      const {
        sessionId,
        autoPopulatedFieldsCount,
        averageConfidence,
        conflictCount,
      } = body;

      if (!sessionId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Missing required field: sessionId",
          status: 400,
        });
      }

      const metrics = await InterviewAnalyticsService.trackSessionCompletion(
        sessionId,
        autoPopulatedFieldsCount || 0,
        averageConfidence || 0,
        conflictCount || 0,
      );

      if (!metrics) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Session not found",
          status: 404,
        });
      }

      return NextResponse.json({
        success: true,
        metrics,
      });
    } catch (error) {
      return fromException(request, error, { stage: "complete" });
    }
  });
}
