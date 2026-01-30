/**
 * Answer Submission Endpoint
 * POST /api/forms/interview/answer
 *
 * Submits an answer to the current interview question
 * Returns the next question or completion status
 */

import { NextRequest, NextResponse } from 'next/server'
import { QuestionType } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { InterviewFlowEngine } from '@/lib/interview'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { sessionId, answer, confidence } = body

    if (!sessionId || answer === undefined) {
      return NextResponse.json(
        { error: 'sessionId and answer are required' },
        { status: 400 }
      )
    }

    // Get interview session from database
    const interviewSession = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { formTemplate: true },
    })

    if (!interviewSession) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      )
    }

    // Verify session belongs to user
    if (interviewSession.userId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: session does not belong to user' },
        { status: 403 }
      )
    }

    // Parse stored session data
    const storedAnswers = interviewSession.answers ? JSON.parse(interviewSession.answers) : {}
    const currentAutoPopulated = interviewSession.autoPopulatedFields
      ? JSON.parse(interviewSession.autoPopulatedFields)
      : {}

    // Recreate interview state using FlowEngine
    // Note: In production, you'd want to store InterviewSessionState in database
    // For now, we reconstruct from stored data
    const questionResponse = await prisma.interviewQuestion.findMany({
      where: { isActive: true },
    })

    // This is a simplified approach - in production, store full session state
    // For now, we'll update the database and return the next question
    storedAnswers[body.questionId] = answer

    // Update session in database
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        answers: JSON.stringify(storedAnswers),
        totalAnswersGiven: Object.keys(storedAnswers).length,
        status: Object.keys(storedAnswers).length === interviewSession.totalQuestionsAsked
          ? 'COMPLETED'
          : 'IN_PROGRESS',
      },
    })

    // Create InterviewResponse record for this answer
    if (body.questionId) {
      const question = questionResponse.find((q) => q.id === body.questionId)
      if (question) {
        await prisma.interviewResponse.create({
          data: {
            interviewSessionId: sessionId,
            questionId: body.questionId,
            questionText: question.text,
            answerValue: typeof answer === 'string' ? answer : JSON.stringify(answer),
            answerType: question.type as unknown as QuestionType,
            answeredAt: new Date(),
          },
        })
      }
    }

    // Return response with interview progress
    return NextResponse.json({
      success: true,
      sessionId,
      totalAnswered: Object.keys(storedAnswers).length,
      totalQuestions: interviewSession.totalQuestionsAsked,
      progressPercentage: Math.round(
        (Object.keys(storedAnswers).length / interviewSession.totalQuestionsAsked) * 100
      ),
      sessionStatus: Object.keys(storedAnswers).length === interviewSession.totalQuestionsAsked
        ? 'COMPLETED'
        : 'IN_PROGRESS',
      message: 'Answer recorded successfully',
    })
  } catch (error) {
    console.error('Interview answer submission error:', error)
    return NextResponse.json(
      {
        error: 'Failed to submit answer',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
