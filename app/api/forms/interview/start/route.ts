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

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscriptionTier: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
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
    const questionResponse =
      QuestionGenerationEngine.generateQuestions(context);

    // Use the tiered questions directly - they're already filtered by userTierLevel
    const filteredTieredQuestions = questionResponse.tieredQuestions;

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
        totalQuestionsAsked: Object.values(filteredTieredQuestions).flat()
          .length,
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
    // RA-786: do not leak error.message to clients
    console.error("Interview start error:", error);
    return NextResponse.json(
      { error: "Failed to start interview" },
      { status: 500 },
    );
  }
}
