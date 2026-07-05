/**
 * Start Interview Endpoint
 * POST /api/forms/interview/start
 *
 * Initiates a guided interview session
 * Returns initial questions organized by tier
 */

import { NextRequest, NextResponse } from "next/server";
import type { SubscriptionTier } from "@/lib/interview/types";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  QuestionGenerationEngine,
  INTERVIEW_QUESTION_LIBRARY,
  getQuestionsForSubscriptionTier,
} from "@/lib/interview";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
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

  // RA-1266: starting an interview creates a session row — prevent
  // orphaned duplicate sessions on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscriptionTier: true },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

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
      const { formTemplateId, jobType, postcode, experienceLevel, reportId } =
        body;

      if (!formTemplateId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "formTemplateId is required",
          status: 400,
        });
      }

      // Get form template — scope to the caller's own templates or shared
      // system templates so a crafted formTemplateId cannot bind an
      // InterviewSession to another tenant's private template (IDOR).
      const formTemplate = await prisma.formTemplate.findFirst({
        where: {
          id: formTemplateId,
          OR: [{ userId: session.user.id }, { isSystemTemplate: true }],
        },
      });

      if (!formTemplate) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Form template not found",
          status: 404,
        });
      }

      // Create interview context
      const context = {
        formTemplateId,
        jobType: jobType || "WATER_DAMAGE",
        postcode,
        userId: user.id,
        userTierLevel: (user.interviewTier?.toLowerCase() ||
          "standard") as SubscriptionTier,
      };

      // Generate questions (already filtered by tier in QuestionGenerationEngine)
      let questionResponse;
      try {
        questionResponse = QuestionGenerationEngine.generateQuestions(context);
      } catch (err) {
        return apiError(request, {
          code: "INTERNAL",
          message: "Failed to generate questions for your subscription tier",
          status: 500,
          err,
          stage: "generateQuestions",
          context: { userId: user.id, jobType: context.jobType },
        });
      }

      // Use the tiered questions directly - they're already filtered by userTierLevel
      const filteredTieredQuestions = questionResponse.tieredQuestions;
      const totalAvailable = Object.values(filteredTieredQuestions).flat()
        .length;

      if (totalAvailable === 0) {
        // Safer than 500 — the client renders "Please check your subscription tier"
        // on 4xx, and this exact shape lets the dashboard show a real message.
        // Preserved bespoke shape: client branches on top-level `code` + `tier`.
        console.warn(
          "[interview/start] zero questions generated for user",
          user.id,
          { tier: user.interviewTier, jobType: context.jobType },
        );
        return NextResponse.json(
          {
            error:
              "No interview questions available for your subscription tier and job type.",
            code: "NO_QUESTIONS_FOR_TIER",
            tier: user.interviewTier,
            jobType: context.jobType,
          },
          { status: 422 },
        );
      }

      // Create interview session in database (optionally linked to a report)
      const interviewSession = await prisma.interviewSession.create({
        data: {
          userId: user.id,
          formTemplateId,
          reportId: reportId || undefined,
          status: "STARTED",
          userTierLevel: user.interviewTier || "STANDARD",
          technicianExperience: experienceLevel || "experienced",
          estimatedTimeMinutes: questionResponse.estimatedDurationMinutes,
          totalQuestionsAsked: totalAvailable,
        },
      });

      // Flatten all questions for the questions array
      const allQuestions = Object.values(filteredTieredQuestions).flat();

      // Ensure tier1 has questions, otherwise use first questions from all tiers
      const tier1Questions =
        filteredTieredQuestions.tier1.length > 0
          ? filteredTieredQuestions.tier1
          : allQuestions.slice(0, Math.min(5, allQuestions.length));

      // Return response with Tier 1 questions (always shown first)
      const response = {
        success: true,
        sessionId: interviewSession.id,
        estimatedDuration: questionResponse.estimatedDurationMinutes,
        totalQuestions: allQuestions.length,
        currentTier: 1,
        questions: tier1Questions,
        tieredQuestions: filteredTieredQuestions,
        standardsCovered: questionResponse.standardsCovered || [],
        message: `Starting guided interview. Tier 1: ${tier1Questions.length} essential questions. Estimated time: ${questionResponse.estimatedDurationMinutes} minutes.`,
      };

      return NextResponse.json(response);
    } catch (error) {
      // RA-786: do not leak error.message to clients.
      return fromException(request, error, { stage: "start" });
    }
  });
}
