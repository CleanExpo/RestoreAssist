/**
 * Start Interview Endpoint
 * POST /api/forms/interview/start
 *
 * Initiates a guided interview session
 * Returns initial questions organized by tier
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { QuestionGenerationEngine, INTERVIEW_QUESTION_LIBRARY, getQuestionsForSubscriptionTier } from '@/lib/interview'
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
      include: { subscriptionTier: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { formTemplateId, jobType, postcode, experienceLevel } = body

    if (!formTemplateId) {
      return NextResponse.json({ error: 'formTemplateId is required' }, { status: 400 })
    }

    // Get form template
    const formTemplate = await prisma.formTemplate.findUnique({
      where: { id: formTemplateId },
    })

    if (!formTemplate) {
      return NextResponse.json({ error: 'Form template not found' }, { status: 404 })
    }

    // Create interview context
    const context = {
      formTemplateId,
      jobType: jobType || 'WATER_DAMAGE',
      postcode,
      userId: user.id,
      userTierLevel: (user.interviewTier || 'standard') as any,
    }

    // Generate questions
    const questionResponse = QuestionGenerationEngine.generateQuestions(context)

    // Filter questions by subscription tier (normalize to lowercase)
    const userTier = (user.interviewTier || 'STANDARD').toLowerCase() as 'standard' | 'premium' | 'enterprise'
    const accessibleQuestions = getQuestionsForSubscriptionTier(userTier)
    const filteredTieredQuestions = {
      tier1: questionResponse.tieredQuestions.tier1.filter((q) =>
        accessibleQuestions.some((aq) => aq.id === q.id)
      ),
      tier2: questionResponse.tieredQuestions.tier2.filter((q) =>
        accessibleQuestions.some((aq) => aq.id === q.id)
      ),
      tier3: questionResponse.tieredQuestions.tier3.filter((q) =>
        accessibleQuestions.some((aq) => aq.id === q.id)
      ),
      tier4: questionResponse.tieredQuestions.tier4.filter((q) =>
        accessibleQuestions.some((aq) => aq.id === q.id)
      ),
    }

    // Create interview session in database
    const interviewSession = await prisma.interviewSession.create({
      data: {
        userId: user.id,
        formTemplateId,
        status: 'STARTED',
        userTierLevel: user.interviewTier || 'STANDARD',
        technicianExperience: experienceLevel || 'experienced',
        estimatedTimeMinutes: questionResponse.estimatedDurationMinutes,
        totalQuestionsAsked: Object.values(filteredTieredQuestions).flat().length,
      },
    })

    // Return response with Tier 1 questions (always shown first)
    return NextResponse.json({
      success: true,
      sessionId: interviewSession.id,
      estimatedDuration: questionResponse.estimatedDurationMinutes,
      totalQuestions: Object.values(filteredTieredQuestions).flat().length,
      currentTier: 1,
      questions: filteredTieredQuestions.tier1,
      tieredQuestions: filteredTieredQuestions,
      standardsCovered: questionResponse.standardsCovered,
      message: `Starting guided interview. Tier 1: ${filteredTieredQuestions.tier1.length} essential questions. Estimated time: ${questionResponse.estimatedDurationMinutes} minutes.`,
    })
  } catch (error) {
    console.error('Interview start error:', error)
    return NextResponse.json(
      {
        error: 'Failed to start interview',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
