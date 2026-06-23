/**
 * Answer Submission Endpoint
 * POST /api/forms/interview/answer
 *
 * Submits an answer to the current interview question
 * Returns the next question or completion status
 */

import { NextRequest, NextResponse } from "next/server";
import { QuestionType } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
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

  // RA-1266: answer submission writes InterviewResponse rows — retry
  // without idempotency double-inserts the answer.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
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
      const { sessionId, answer, confidence: _confidence } = body;

      if (!sessionId || answer === undefined) {
        return apiError(request, {
          code: "VALIDATION",
          message: "sessionId and answer are required",
          status: 400,
        });
      }

      // Get interview session from database
      const interviewSession = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: { formTemplate: true },
      });

      if (!interviewSession) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Interview session not found",
          status: 404,
        });
      }

      // Verify session belongs to user
      if (interviewSession.userId !== user.id) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Unauthorized: session does not belong to user",
          status: 403,
        });
      }

      // Parse stored session data
      const storedAnswers = interviewSession.answers
        ? JSON.parse(interviewSession.answers)
        : {};
      const _currentAutoPopulated = interviewSession.autoPopulatedFields
        ? JSON.parse(interviewSession.autoPopulatedFields)
        : {};

      // Recreate interview state using FlowEngine
      // Note: In production, you'd want to store InterviewSessionState in database
      // For now, we reconstruct from stored data
      const questionResponse = await prisma.interviewQuestion.findMany({
        where: { isActive: true },
      });

      // This is a simplified approach - in production, store full session state
      // For now, we'll update the database and return the next question
      storedAnswers[body.questionId] = answer;

      // Update session in database
      await prisma.interviewSession.update({
        where: { id: sessionId, userId: user.id },
        data: {
          answers: JSON.stringify(storedAnswers),
          totalAnswersGiven: Object.keys(storedAnswers).length,
          status:
            Object.keys(storedAnswers).length ===
            interviewSession.totalQuestionsAsked
              ? "COMPLETED"
              : "IN_PROGRESS",
        },
      });

      // Create InterviewResponse record for this answer
      if (body.questionId) {
        const question = questionResponse.find((q) => q.id === body.questionId);
        if (question) {
          await prisma.interviewResponse.create({
            data: {
              interviewSessionId: sessionId,
              questionId: body.questionId,
              questionText: question.text,
              answerValue:
                typeof answer === "string" ? answer : JSON.stringify(answer),
              answerType: question.type as unknown as QuestionType,
              answeredAt: new Date(),
            },
          });
        }
      }

      // Return response with interview progress
      return NextResponse.json({
        success: true,
        sessionId,
        totalAnswered: Object.keys(storedAnswers).length,
        totalQuestions: interviewSession.totalQuestionsAsked,
        progressPercentage: Math.round(
          (Object.keys(storedAnswers).length /
            interviewSession.totalQuestionsAsked) *
            100,
        ),
        sessionStatus:
          Object.keys(storedAnswers).length ===
          interviewSession.totalQuestionsAsked
            ? "COMPLETED"
            : "IN_PROGRESS",
        message: "Answer recorded successfully",
      });
    } catch (error) {
      // RA-786: do not leak error.message to clients
      return fromException(request, error, { stage: "answer" });
    }
  });
}
