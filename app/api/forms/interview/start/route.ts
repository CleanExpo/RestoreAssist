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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const { formTemplateId, jobType, postcode, experienceLevel, reportId } =
        body;

      if (!formTemplateId) {
        return NextResponse.json(
          { error: "formTemplateId is required" },
          { status: 400 },
        );
      }

      // Get form template
      const formTemplate = await prisma.formTemplate.findUnique({
        where: { id: formTemplateId },
      });

      if (!formTemplate) {
        return NextResponse.json(
          { error: "Form template not found" },
          { status: 404 },
        );
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
        console.error("[interview/start] generateQuestions threw:", err, {
          context,
        });
        return NextResponse.json(
          {
            error: "Failed to generate questions for your subscription tier",
            code: "QUESTION_GENERATION_FAILED",
          },
          { status: 500 },
        );
      }

      // Use the tiered questions directly - they're already filtered by userTierLevel
      const filteredTieredQuestions = questionResponse.tieredQuestions;
      const totalAvailable = Object.values(filteredTieredQuestions).flat()
        .length;

      if (totalAvailable === 0) {
        // Safer than 500 — the client renders "Please check your subscription tier"
        // on 4xx, and this exact shape lets the dashboard show a real message.
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
      // RA-786: do not leak error.message to clients. Include an error code
      // the UI can branch on so the user sees a useful toast instead of a
      // generic "Failed to start interview" that gives them nothing to act on.
      const errCode =
        error instanceof Error && error.name === "PrismaClientKnownRequestError"
          ? "DB_ERROR"
          : "UNKNOWN";
      console.error("Interview start error:", error, { code: errCode });
      return NextResponse.json(
        { error: "Failed to start interview", code: errCode },
        { status: 500 },
      );
    }
  });
}
