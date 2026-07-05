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
import { prisma } from "@/lib/prisma";

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

      // RA-909: trackSessionCompletion previously resolved sessionId with no
      // ownership check, so any authenticated user could mark another
      // tenant's interview session complete by supplying its id. Scope the
      // lookup to the caller before calling the service — 404 (not 403) so
      // a foreign sessionId doesn't confirm existence, matching the
      // FormTemplate IDOR fix pattern (#1754/#1760).
      const interviewSession = await prisma.interviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      });

      if (!interviewSession) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Session not found",
          status: 404,
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
