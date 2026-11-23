/**
 * Answer Submission Endpoint
 * POST /api/forms/interview/answer
 *
 * Submits an answer to the current interview question
 * Returns the next question or completion status
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { InterviewFlowEngine } from "@/lib/interview";
import { prisma } from "@/lib/prisma";
import {
  findTranscriptQuestion,
  serialiseAnswerValue,
} from "@/lib/interview/transcript";
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
      const { sessionId, answer, confidence } = body;

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
      const currentAutoPopulated = interviewSession.autoPopulatedFields
        ? JSON.parse(interviewSession.autoPopulatedFields)
        : {};

      // Recreate interview state using FlowEngine
      // Note: In production, you'd want to store InterviewSessionState in database
      // For now, we reconstruct from stored data
      // This is a simplified approach - in production, store full session state
      // For now, we'll update the database and return the next question
      storedAnswers[body.questionId] = answer;

      // Update session in database
      await prisma.interviewSession.update({
        where: { id: sessionId },
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

      // RA-8594: write the transcript row. Question text and type come from
      // the code question library (the list the interview screen uses), not
      // the InterviewQuestion table, which nothing fills. One row per
      // (session, question): answering again overwrites it.
      //
      // An id outside the library gets no row, on purpose: there is no owner
      // for its text. AI-suggested follow-ups (`ai-suggestion-...` ids) never
      // reach this route; GuidedInterviewPanel keeps them as local addenda
      // and passes them to onComplete. The answer is still kept in
      // `answers` above, and the reply says no transcript row was written.
      const transcriptQuestion = findTranscriptQuestion(body.questionId);
      let transcriptRecorded = false;
      if (transcriptQuestion) {
        const answerValue = serialiseAnswerValue(answer);
        const answeredAt = new Date();
        const existing = await prisma.interviewResponse.findFirst({
          where: { interviewSessionId: sessionId, questionId: body.questionId },
          select: { id: true },
        });
        if (existing) {
          await prisma.interviewResponse.update({
            where: { id: existing.id },
            data: {
              questionText: transcriptQuestion.text,
              answerValue,
              answerType: transcriptQuestion.type,
              answeredAt,
            },
          });
        } else {
          await prisma.interviewResponse.create({
            data: {
              interviewSessionId: sessionId,
              questionId: body.questionId,
              questionText: transcriptQuestion.text,
              answerValue,
              answerType: transcriptQuestion.type,
              answeredAt,
            },
          });
        }
        transcriptRecorded = true;
      }

      // Return response with interview progress
      return NextResponse.json({
        transcriptRecorded,
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
        message: transcriptRecorded
          ? "Answer recorded successfully"
          : "Answer saved to the session; no transcript row was written because the question is not in the interview question library",
      });
    } catch (error) {
      // RA-786: do not leak error.message to clients
      return fromException(request, error, { stage: "answer" });
    }
  });
}
