/**
 * Interview Analytics Service
 * Tracks and analyzes interview metrics for performance optimization
 * Provides insights on user behavior, completion rates, and form field confidence
 */

import { prisma } from '@/lib/prisma'

/**
 * Interview Session Metrics
 */
export interface InterviewSessionMetrics {
  sessionId: string
  userId: string
  formTemplateId: string
  startTime: Date
  endTime?: Date
  totalDurationSeconds?: number
  questionsAnswered: number
  totalQuestions: number
  completionRate: number // 0-100
  status: 'in_progress' | 'completed' | 'abandoned'
  autoPopulatedFieldsCount: number
  averageConfidence: number
  conflictCount: number
  reportId?: string
}

/**
 * Per-Question Analytics
 */
export interface QuestionAnalytics {
  questionId: string
  sessionId: string
  timeToAnswerSeconds: number
  skipLogicTriggered: boolean
  conditionalShowTriggered: boolean
  answerValue: any
  fieldsMappedCount: number
  averageFieldConfidence: number
}

/**
 * User Analytics Summary
 */
export interface UserAnalyticsSummary {
  userId: string
  totalInterviewsSessions: number
  completedSessions: number
  abandonedSessions: number
  completionRate: number
  averageSessionDurationSeconds: number
  averageFieldConfidence: number
  mostCommonTemplate: string
  totalFieldsAutoPopulated: number
  averageConflicts: number
}

/**
 * Template Performance Analytics
 */
export interface TemplatePerformanceAnalytics {
  templateId: string
  totalSessions: number
  completionRate: number
  averageSessionDuration: number
  averageFieldsPopulated: number
  fieldConfidenceDistribution: {
    high: number // >= 90%
    medium: number // 75-89%
    low: number // < 75%
  }
  mostDifficultQuestions: Array<{
    questionId: string
    skipRate: number
    averageTimeSeconds: number
  }>
  recommendedImprovements: string[]
}

/**
 * Interview Analytics Service
 */
export class InterviewAnalyticsService {
  /**
   * Track interview session start
   */
  static async trackSessionStart(
    sessionId: string,
    userId: string,
    formTemplateId: string,
    reportId?: string
  ): Promise<void> {
    try {
      await prisma.interviewSession.update(
        {
          where: { id: sessionId },
          data: {
            startedAt: new Date(),
            metadata: {
              startedAt: new Date().toISOString(),
              analyticsEnabled: true,
            },
          },
        }
      )
    } catch (error) {
      console.error('Error tracking session start:', error)
    }
  }

  /**
   * Track interview session completion
   */
  static async trackSessionCompletion(
    sessionId: string,
    autoPopulatedFieldsCount: number,
    averageConfidence: number,
    conflictCount: number
  ): Promise<InterviewSessionMetrics | null> {
    try {
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: { responses: true },
      })

      if (!session) {
        return null
      }

      const endTime = new Date()
      const startTime = session.startedAt || new Date()
      const totalDurationSeconds = Math.round(
        (endTime.getTime() - startTime.getTime()) / 1000
      )
      const completionRate = session.responses.length > 0 ? 100 : 0

      // Update session with completion metrics
      await prisma.interviewSession.update(
        {
          where: { id: sessionId },
          data: {
            completedAt: endTime,
            status: 'COMPLETED',
            metadata: {
              completedAt: endTime.toISOString(),
              totalDurationSeconds,
              autoPopulatedFieldsCount,
              averageConfidence,
              conflictCount,
            },
          },
        }
      )

      return {
        sessionId,
        userId: session.userId,
        formTemplateId: session.formTemplateId,
        startTime,
        endTime,
        totalDurationSeconds,
        questionsAnswered: session.responses.length,
        totalQuestions: 25, // Default, should be actual count
        completionRate,
        status: 'completed',
        autoPopulatedFieldsCount,
        averageConfidence,
        conflictCount,
        reportId: session.reportId || undefined,
      }
    } catch (error) {
      console.error('Error tracking session completion:', error)
      return null
    }
  }

  /**
   * Track individual question response
   */
  static async trackQuestionResponse(
    sessionId: string,
    questionId: string,
    answerValue: any,
    timeToAnswerSeconds: number,
    fieldsMappedCount: number = 0,
    averageFieldConfidence: number = 0
  ): Promise<void> {
    try {
      await prisma.interviewResponse.create({
        data: {
          interviewSessionId: sessionId,
          questionId,
          answer: answerValue,
          metadata: {
            timeToAnswerSeconds,
            fieldsMappedCount,
            averageFieldConfidence,
            trackedAt: new Date().toISOString(),
          },
        },
      })
    } catch (error) {
      console.error('Error tracking question response:', error)
    }
  }

  /**
   * Get user analytics summary
   */
  static async getUserAnalyticsSummary(userId: string): Promise<UserAnalyticsSummary> {
    try {
      const sessions = await prisma.interviewSession.findMany({
        where: { userId },
        include: { responses: true },
      })

      if (sessions.length === 0) {
        return {
          userId,
          totalInterviewsSessions: 0,
          completedSessions: 0,
          abandonedSessions: 0,
          completionRate: 0,
          averageSessionDurationSeconds: 0,
          averageFieldConfidence: 0,
          mostCommonTemplate: '',
          totalFieldsAutoPopulated: 0,
          averageConflicts: 0,
        }
      }

      const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length
      const abandonedSessions = sessions.filter((s) => s.status === 'ABANDONED').length
      const completionRate =
        sessions.length > 0 ? Math.round((completedSessions / sessions.length) * 100) : 0

      // Calculate average metrics
      let totalDuration = 0
      let totalConfidence = 0
      let totalFieldsPopulated = 0
      let totalConflicts = 0
      let confidenceCount = 0

      sessions.forEach((session) => {
        const metadata = session.metadata as any
        if (metadata?.totalDurationSeconds) {
          totalDuration += metadata.totalDurationSeconds
        }
        if (metadata?.averageConfidence) {
          totalConfidence += metadata.averageConfidence
          confidenceCount++
        }
        if (metadata?.autoPopulatedFieldsCount) {
          totalFieldsPopulated += metadata.autoPopulatedFieldsCount
        }
        if (metadata?.conflictCount) {
          totalConflicts += metadata.conflictCount
        }
      })

      // Find most common template
      const templateCounts = sessions.reduce(
        (acc, session) => {
          acc[session.formTemplateId] = (acc[session.formTemplateId] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      const mostCommonTemplate = Object.entries(templateCounts).sort(
        ([, a], [, b]) => b - a
      )[0]?.[0] || ''

      return {
        userId,
        totalInterviewsSessions: sessions.length,
        completedSessions,
        abandonedSessions,
        completionRate,
        averageSessionDurationSeconds: Math.round(totalDuration / Math.max(sessions.length, 1)),
        averageFieldConfidence:
          confidenceCount > 0
            ? Math.round(totalConfidence / confidenceCount)
            : 0,
        mostCommonTemplate,
        totalFieldsAutoPopulated: totalFieldsPopulated,
        averageConflicts: Math.round(totalConflicts / Math.max(sessions.length, 1)),
      }
    } catch (error) {
      console.error('Error getting user analytics summary:', error)
      return {
        userId,
        totalInterviewsSessions: 0,
        completedSessions: 0,
        abandonedSessions: 0,
        completionRate: 0,
        averageSessionDurationSeconds: 0,
        averageFieldConfidence: 0,
        mostCommonTemplate: '',
        totalFieldsAutoPopulated: 0,
        averageConflicts: 0,
      }
    }
  }

  /**
   * Get template performance analytics
   */
  static async getTemplatePerformanceAnalytics(
    templateId: string
  ): Promise<TemplatePerformanceAnalytics> {
    try {
      const sessions = await prisma.interviewSession.findMany({
        where: { formTemplateId: templateId },
        include: { responses: true },
      })

      if (sessions.length === 0) {
        return {
          templateId,
          totalSessions: 0,
          completionRate: 0,
          averageSessionDuration: 0,
          averageFieldsPopulated: 0,
          fieldConfidenceDistribution: { high: 0, medium: 0, low: 0 },
          mostDifficultQuestions: [],
          recommendedImprovements: [],
        }
      }

      const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length
      const completionRate = Math.round((completedSessions / sessions.length) * 100)

      // Calculate metrics
      let totalDuration = 0
      let totalFieldsPopulated = 0
      let highConfidenceCount = 0
      let mediumConfidenceCount = 0
      let lowConfidenceCount = 0

      sessions.forEach((session) => {
        const metadata = session.metadata as any
        if (metadata?.totalDurationSeconds) {
          totalDuration += metadata.totalDurationSeconds
        }
        if (metadata?.autoPopulatedFieldsCount) {
          totalFieldsPopulated += metadata.autoPopulatedFieldsCount
        }
        if (metadata?.averageConfidence) {
          if (metadata.averageConfidence >= 90) highConfidenceCount++
          else if (metadata.averageConfidence >= 75) mediumConfidenceCount++
          else lowConfidenceCount++
        }
      })

      const recommendations: string[] = []
      if (completionRate < 70) {
        recommendations.push('Low completion rate - consider simplifying questions or providing better guidance')
      }
      if (completionRate > 70 && completionRate < 90) {
        recommendations.push('Moderate completion rate - some questions may need clarification')
      }
      if (totalFieldsPopulated / Math.max(sessions.length, 1) < 30) {
        recommendations.push('Low average fields populated - review field mapping coverage')
      }

      return {
        templateId,
        totalSessions: sessions.length,
        completionRate,
        averageSessionDuration: Math.round(totalDuration / Math.max(sessions.length, 1)),
        averageFieldsPopulated: Math.round(totalFieldsPopulated / Math.max(sessions.length, 1)),
        fieldConfidenceDistribution: {
          high: highConfidenceCount,
          medium: mediumConfidenceCount,
          low: lowConfidenceCount,
        },
        mostDifficultQuestions: [], // TODO: Implement based on skip rates
        recommendedImprovements: recommendations,
      }
    } catch (error) {
      console.error('Error getting template performance analytics:', error)
      return {
        templateId,
        totalSessions: 0,
        completionRate: 0,
        averageSessionDuration: 0,
        averageFieldsPopulated: 0,
        fieldConfidenceDistribution: { high: 0, medium: 0, low: 0 },
        mostDifficultQuestions: [],
        recommendedImprovements: [],
      }
    }
  }

  /**
   * Get aggregate statistics across all interviews
   */
  static async getAggregateStatistics(): Promise<{
    totalSessions: number
    completedSessions: number
    completionRate: number
    averageSessionDuration: number
    averageFieldsPopulated: number
    averageFieldConfidence: number
    topPerformingTemplates: Array<{
      templateId: string
      completionRate: number
      sessionCount: number
    }>
  }> {
    try {
      const sessions = await prisma.interviewSession.findMany({
        include: { responses: true },
      })

      const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length
      const completionRate = sessions.length > 0 ? Math.round((completedSessions / sessions.length) * 100) : 0

      let totalDuration = 0
      let totalFieldsPopulated = 0
      let totalConfidence = 0
      let confidenceCount = 0

      sessions.forEach((session) => {
        const metadata = session.metadata as any
        if (metadata?.totalDurationSeconds) totalDuration += metadata.totalDurationSeconds
        if (metadata?.autoPopulatedFieldsCount) totalFieldsPopulated += metadata.autoPopulatedFieldsCount
        if (metadata?.averageConfidence) {
          totalConfidence += metadata.averageConfidence
          confidenceCount++
        }
      })

      // Get top performing templates
      const templateStats = sessions.reduce(
        (acc, session) => {
          if (!acc[session.formTemplateId]) {
            acc[session.formTemplateId] = { completed: 0, total: 0 }
          }
          acc[session.formTemplateId].total++
          if (session.status === 'COMPLETED') {
            acc[session.formTemplateId].completed++
          }
          return acc
        },
        {} as Record<string, { completed: number; total: number }>
      )

      const topPerformingTemplates = Object.entries(templateStats)
        .map(([templateId, { completed, total }]) => ({
          templateId,
          completionRate: Math.round((completed / total) * 100),
          sessionCount: total,
        }))
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 5)

      return {
        totalSessions: sessions.length,
        completedSessions,
        completionRate,
        averageSessionDuration: Math.round(totalDuration / Math.max(sessions.length, 1)),
        averageFieldsPopulated: Math.round(totalFieldsPopulated / Math.max(sessions.length, 1)),
        averageFieldConfidence: confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0,
        topPerformingTemplates,
      }
    } catch (error) {
      console.error('Error getting aggregate statistics:', error)
      return {
        totalSessions: 0,
        completedSessions: 0,
        completionRate: 0,
        averageSessionDuration: 0,
        averageFieldsPopulated: 0,
        averageFieldConfidence: 0,
        topPerformingTemplates: [],
      }
    }
  }
}
