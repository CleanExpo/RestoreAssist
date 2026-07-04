/**
 * Interview Analytics Service
 * Tracks and analyzes interview metrics for performance optimization
 * Provides insights on user behavior, completion rates, and form field confidence
 */

import { prisma } from "@/lib/prisma";

/**
 * RA-6968 — hard cap on the number of InterviewSession rows loaded per
 * analytics query. These previously ran unbounded `findMany` calls (one had
 * no `where` clause at all) with `include: { responses: true }`, pulling
 * every session's full row — including several large `@db.Text` JSON blobs
 * — plus every nested response, for the entire history. Ordered
 * most-recent-first so a capped result still reflects current usage.
 */
const MAX_SESSIONS_PER_ANALYTICS_QUERY = 5000;

/**
 * RA-6975 — `take: MAX_SESSIONS_PER_ANALYTICS_QUERY` silently truncates a
 * template/account with more sessions than the cap: completion-rate and
 * difficulty metrics are then computed from only the most-recent slice
 * while the caller has no way to know the result isn't all-time. Every
 * query below also reports how many sessions it actually sampled and
 * whether the true total exceeds that sample.
 */
async function getSampleMeta(
  where: Record<string, unknown>,
  sampleSize: number,
): Promise<{ sampleSize: number; truncated: boolean }> {
  if (sampleSize === 0) {
    return { sampleSize: 0, truncated: false };
  }
  const totalCount = await prisma.interviewSession.count({ where });
  return { sampleSize, truncated: totalCount > sampleSize };
}

/**
 * RA-6975 (pre-existing dead-metric bug) — the duration/confidence metrics
 * below previously read `session.metadata.*` and `response.metadata` /
 * `response.answer`. None of those fields exist on the Prisma schema (see
 * the InterviewSession / InterviewResponse models) — they were always
 * undefined, so these metrics silently computed to zero. The real,
 * persisted equivalents are:
 *  - auto-populated field count + confidence -> InterviewSession.autoPopulatedFields
 *    (JSON: Record<fieldId, { value, confidence }>, written by
 *    lib/interview/interview-flow-engine.ts)
 *  - session duration -> InterviewSession.startedAt / completedAt
 *  - whether a question was skipped -> InterviewResponse.answerValue
 * There is no real equivalent anywhere on the schema for "conflictCount", so
 * that always-undefined metric has been removed rather than faked.
 */
function parseAutoPopulatedFieldStats(
  autoPopulatedFields: string | null | undefined,
): { count: number; confidences: number[] } {
  if (!autoPopulatedFields) {
    return { count: 0, confidences: [] };
  }
  try {
    const parsed = JSON.parse(autoPopulatedFields) as Record<
      string,
      { confidence?: number } | null | undefined
    >;
    const entries = Object.values(parsed).filter(
      (entry): entry is { confidence?: number } => entry != null,
    );
    const confidences = entries
      .map((entry) => entry.confidence)
      .filter((c): c is number => typeof c === "number");
    return { count: entries.length, confidences };
  } catch {
    return { count: 0, confidences: [] };
  }
}

function sessionDurationSeconds(
  startedAt: Date | null | undefined,
  completedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !completedAt) {
    return null;
  }
  return Math.max(
    0,
    Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
  );
}

/**
 * Interview Session Metrics
 */
export interface InterviewSessionMetrics {
  sessionId: string;
  userId: string;
  formTemplateId: string;
  startTime: Date;
  endTime?: Date;
  totalDurationSeconds?: number;
  questionsAnswered: number;
  totalQuestions: number;
  completionRate: number; // 0-100
  status: "in_progress" | "completed" | "abandoned";
  autoPopulatedFieldsCount: number;
  averageConfidence: number;
  conflictCount: number;
  reportId?: string;
}

/**
 * Per-Question Analytics
 */
export interface QuestionAnalytics {
  questionId: string;
  sessionId: string;
  timeToAnswerSeconds: number;
  skipLogicTriggered: boolean;
  conditionalShowTriggered: boolean;
  answerValue: any;
  fieldsMappedCount: number;
  averageFieldConfidence: number;
}

/**
 * User Analytics Summary
 */
export interface UserAnalyticsSummary {
  userId: string;
  totalInterviewsSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  completionRate: number;
  averageSessionDurationSeconds: number;
  averageFieldConfidence: number;
  mostCommonTemplate: string;
  totalFieldsAutoPopulated: number;
  /** RA-6975: number of sessions actually sampled for this summary. */
  sampleSize: number;
  /** RA-6975: true when the account has more sessions than sampleSize. */
  truncated: boolean;
}

/**
 * Template Performance Analytics
 */
export interface TemplatePerformanceAnalytics {
  templateId: string;
  totalSessions: number;
  completionRate: number;
  averageSessionDuration: number;
  averageFieldsPopulated: number;
  fieldConfidenceDistribution: {
    high: number; // >= 90%
    medium: number; // 75-89%
    low: number; // < 75%
  };
  mostDifficultQuestions: Array<{
    questionId: string;
    skipRate: number;
    averageTimeSeconds: number;
  }>;
  recommendedImprovements: string[];
  /** RA-6975: number of sessions actually sampled for this summary. */
  sampleSize: number;
  /** RA-6975: true when the template has more sessions than sampleSize. */
  truncated: boolean;
}

/**
 * Interview Analytics Service
 */
// RA-6983: trackSessionStart and trackQuestionResponse were removed here —
// both wrote fields that don't exist on the Prisma models (`metadata` on
// InterviewSession; `answer`/`metadata` on InterviewResponse, whose real
// column is `answerValue`) behind `as any` casts, so every invocation threw
// at runtime and was swallowed. Neither had a caller anywhere in the app.
export class InterviewAnalyticsService {
  /**
   * Track interview session completion
   *
   * RA-6989: previously wrapped in a try/catch that swallowed every error
   * (DB timeouts, connection resets, the update failing) and returned
   * `null` — indistinguishable from the genuine "session not found" case,
   * so the complete route 404'd a session that exists on a transient
   * failure. `null` is now returned ONLY when the session genuinely
   * doesn't exist; every other error propagates so the route's
   * `fromException` maps it to a 500.
   */
  static async trackSessionCompletion(
    sessionId: string,
    autoPopulatedFieldsCount: number,
    averageConfidence: number,
    conflictCount: number,
  ): Promise<InterviewSessionMetrics | null> {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { responses: true },
    });

    if (!session) {
      return null;
    }

    const endTime = new Date();
    const startTime = session.startedAt || new Date();
    const totalDurationSeconds = Math.round(
      (endTime.getTime() - startTime.getTime()) / 1000,
    );

    // RA-6989: totalQuestions was hardcoded to 25. The real per-session
    // total is already persisted on InterviewSession.totalQuestionsAsked —
    // set from the tier/jobType-filtered question set at
    // POST /api/forms/interview/start (see
    // app/api/forms/interview/start/route.ts) and used the same way by
    // POST /api/forms/interview/answer for its own progressPercentage. It
    // is not derivable from FormTemplate.formSchema: that column belongs to
    // the separate work-order form-builder system (sections of form
    // fields) and has no relationship to the AI-guided interview's
    // generated question set. Fall back to 25 only for legacy rows
    // predating this column (default 0).
    const questionsAnswered = session.responses.length;
    const totalQuestions =
      session.totalQuestionsAsked > 0 ? session.totalQuestionsAsked : 25;
    const completionRate = Math.min(
      100,
      Math.round((questionsAnswered / totalQuestions) * 100),
    );

    // RA-6983: this update previously also wrote a `metadata` object — a
    // field that does not exist on InterviewSession — behind an `as any`
    // cast. Prisma's runtime validation threw ("Unknown argument
    // `metadata`"), the catch swallowed it, and the method returned null:
    // no session was ever marked COMPLETED and the complete route 404'd
    // sessions that exist. Only real columns are written now, and the cast
    // is gone so the compiler enforces that.
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        completedAt: endTime,
        status: "COMPLETED",
      },
    });

    return {
      sessionId,
      userId: session.userId,
      formTemplateId: session.formTemplateId,
      startTime,
      endTime,
      totalDurationSeconds,
      questionsAnswered,
      totalQuestions,
      completionRate,
      status: "completed",
      autoPopulatedFieldsCount,
      averageConfidence,
      conflictCount,
      reportId: session.reportId || undefined,
    };
  }

  /**
   * Get user analytics summary
   */
  static async getUserAnalyticsSummary(
    userId: string,
  ): Promise<UserAnalyticsSummary> {
    try {
      const where = { userId };
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          status: true,
          formTemplateId: true,
          startedAt: true,
          completedAt: true,
          autoPopulatedFields: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_SESSIONS_PER_ANALYTICS_QUERY,
      });

      if (sessions.length === 0) {
        return {
          userId,
          totalInterviewsSessions: 0,
          completedSessions: 0,
          abandonedSessions: 0,
          completionRate: 0,
          averageSessionDurationSeconds: 0,
          averageFieldConfidence: 0,
          mostCommonTemplate: "",
          totalFieldsAutoPopulated: 0,
          sampleSize: 0,
          truncated: false,
        };
      }

      const completedSessions = sessions.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const abandonedSessions = sessions.filter(
        (s) => s.status === "ABANDONED",
      ).length;
      const completionRate =
        sessions.length > 0
          ? Math.round((completedSessions / sessions.length) * 100)
          : 0;

      // Calculate average metrics from real, persisted fields (RA-6975)
      let totalDuration = 0;
      let durationCount = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;
      let totalFieldsPopulated = 0;

      sessions.forEach((session) => {
        const duration = sessionDurationSeconds(
          session.startedAt,
          session.completedAt,
        );
        if (duration !== null) {
          totalDuration += duration;
          durationCount++;
        }

        const { count, confidences } = parseAutoPopulatedFieldStats(
          session.autoPopulatedFields,
        );
        totalFieldsPopulated += count;
        confidences.forEach((confidence) => {
          totalConfidence += confidence;
          confidenceCount++;
        });
      });

      // Find most common template
      const templateCounts = sessions.reduce(
        (acc, session) => {
          acc[session.formTemplateId] = (acc[session.formTemplateId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const mostCommonTemplate =
        Object.entries(templateCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ||
        "";

      const { sampleSize, truncated } = await getSampleMeta(
        where,
        sessions.length,
      );

      return {
        userId,
        totalInterviewsSessions: sessions.length,
        completedSessions,
        abandonedSessions,
        completionRate,
        averageSessionDurationSeconds:
          durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        averageFieldConfidence:
          confidenceCount > 0
            ? Math.round(totalConfidence / confidenceCount)
            : 0,
        mostCommonTemplate,
        totalFieldsAutoPopulated: totalFieldsPopulated,
        sampleSize,
        truncated,
      };
    } catch (error) {
      console.error("Error getting user analytics summary:", error);
      return {
        userId,
        totalInterviewsSessions: 0,
        completedSessions: 0,
        abandonedSessions: 0,
        completionRate: 0,
        averageSessionDurationSeconds: 0,
        averageFieldConfidence: 0,
        mostCommonTemplate: "",
        totalFieldsAutoPopulated: 0,
        sampleSize: 0,
        truncated: false,
      };
    }
  }

  /**
   * Get template performance analytics
   */
  static async getTemplatePerformanceAnalytics(
    templateId: string,
  ): Promise<TemplatePerformanceAnalytics> {
    try {
      const where = { formTemplateId: templateId };
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          autoPopulatedFields: true,
          responses: { select: { questionId: true, answerValue: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_SESSIONS_PER_ANALYTICS_QUERY,
      });

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
          sampleSize: 0,
          truncated: false,
        };
      }

      const completedSessions = sessions.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const completionRate = Math.round(
        (completedSessions / sessions.length) * 100,
      );

      // Calculate metrics from real, persisted fields (RA-6975)
      let totalDuration = 0;
      let durationCount = 0;
      let totalFieldsPopulated = 0;
      let highConfidenceCount = 0;
      let mediumConfidenceCount = 0;
      let lowConfidenceCount = 0;

      sessions.forEach((session) => {
        const duration = sessionDurationSeconds(
          session.startedAt,
          session.completedAt,
        );
        if (duration !== null) {
          totalDuration += duration;
          durationCount++;
        }

        const { count, confidences } = parseAutoPopulatedFieldStats(
          session.autoPopulatedFields,
        );
        totalFieldsPopulated += count;
        if (confidences.length > 0) {
          const averageConfidence =
            confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
          if (averageConfidence >= 90) highConfidenceCount++;
          else if (averageConfidence >= 75) mediumConfidenceCount++;
          else lowConfidenceCount++;
        }
      });

      const recommendations: string[] = [];
      if (completionRate < 70) {
        recommendations.push(
          "Low completion rate - consider simplifying questions or providing better guidance",
        );
      }
      if (completionRate > 70 && completionRate < 90) {
        recommendations.push(
          "Moderate completion rate - some questions may need clarification",
        );
      }
      if (totalFieldsPopulated / Math.max(sessions.length, 1) < 30) {
        recommendations.push(
          "Low average fields populated - review field mapping coverage",
        );
      }

      // Calculate most difficult questions based on skip rate. There is no
      // real per-response confidence field on the schema (RA-6975), so
      // difficulty is scored on skip rate alone.
      const questionStats: Map<
        string,
        { skipCount: number; totalOccurrences: number }
      > = new Map();

      sessions.forEach((session) => {
        session.responses.forEach((response) => {
          const questionId = response.questionId;
          const stats = questionStats.get(questionId) || {
            skipCount: 0,
            totalOccurrences: 0,
          };
          stats.totalOccurrences++;

          // Check if question was skipped (null or empty answer)
          if (!response.answerValue || response.answerValue === "") {
            stats.skipCount++;
          }

          questionStats.set(questionId, stats);
        });
      });

      // Convert to array and sort by difficulty (skip rate)
      const mostDifficultQuestions = Array.from(questionStats.entries())
        .map(([questionId, stats]) => ({
          questionId,
          skipRate: Math.round(
            (stats.skipCount / Math.max(stats.totalOccurrences, 1)) * 100,
          ),
        }))
        .filter((q) => q.skipRate > 20) // Only include questions with >20% skip rate
        .sort((a, b) => b.skipRate - a.skipRate)
        .slice(0, 5); // Top 5 most difficult questions

      const { sampleSize, truncated } = await getSampleMeta(
        where,
        sessions.length,
      );

      return {
        templateId,
        totalSessions: sessions.length,
        completionRate,
        averageSessionDuration:
          durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        averageFieldsPopulated: Math.round(
          totalFieldsPopulated / Math.max(sessions.length, 1),
        ),
        fieldConfidenceDistribution: {
          high: highConfidenceCount,
          medium: mediumConfidenceCount,
          low: lowConfidenceCount,
        },
        mostDifficultQuestions: mostDifficultQuestions as any,
        recommendedImprovements: recommendations,
        sampleSize,
        truncated,
      };
    } catch (error) {
      console.error("Error getting template performance analytics:", error);
      return {
        templateId,
        totalSessions: 0,
        completionRate: 0,
        averageSessionDuration: 0,
        averageFieldsPopulated: 0,
        fieldConfidenceDistribution: { high: 0, medium: 0, low: 0 },
        mostDifficultQuestions: [],
        recommendedImprovements: [],
        sampleSize: 0,
        truncated: false,
      };
    }
  }

  /**
   * Get aggregate statistics for a specific user (dashboard KPIs)
   */
  static async getAggregateStatisticsForUser(userId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
    averageSessionDuration: number;
    averageFieldsPopulated: number;
    averageFieldConfidence: number;
    topPerformingTemplates: Array<{
      templateId: string;
      completionRate: number;
      sessionCount: number;
    }>;
    sampleSize: number;
    truncated: boolean;
  }> {
    try {
      const where = { userId };
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          status: true,
          formTemplateId: true,
          startedAt: true,
          completedAt: true,
          autoPopulatedFields: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_SESSIONS_PER_ANALYTICS_QUERY,
      });

      const completedSessions = sessions.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const completionRate =
        sessions.length > 0
          ? Math.round((completedSessions / sessions.length) * 100)
          : 0;

      let totalDuration = 0;
      let durationCount = 0;
      let totalFieldsPopulated = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;

      sessions.forEach((session) => {
        const duration = sessionDurationSeconds(
          session.startedAt,
          session.completedAt,
        );
        if (duration !== null) {
          totalDuration += duration;
          durationCount++;
        }

        const { count, confidences } = parseAutoPopulatedFieldStats(
          session.autoPopulatedFields,
        );
        totalFieldsPopulated += count;
        confidences.forEach((confidence) => {
          totalConfidence += confidence;
          confidenceCount++;
        });
      });

      const templateStats = sessions.reduce(
        (acc, session) => {
          if (!acc[session.formTemplateId]) {
            acc[session.formTemplateId] = { completed: 0, total: 0 };
          }
          acc[session.formTemplateId].total++;
          if (session.status === "COMPLETED") {
            acc[session.formTemplateId].completed++;
          }
          return acc;
        },
        {} as Record<string, { completed: number; total: number }>,
      );

      const topPerformingTemplates = Object.entries(templateStats)
        .map(([templateId, { completed, total }]) => ({
          templateId,
          completionRate: Math.round((completed / total) * 100),
          sessionCount: total,
        }))
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 5);

      const { sampleSize, truncated } = await getSampleMeta(
        where,
        sessions.length,
      );

      return {
        totalSessions: sessions.length,
        completedSessions,
        completionRate,
        averageSessionDuration:
          durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        averageFieldsPopulated: Math.round(
          totalFieldsPopulated / Math.max(sessions.length, 1),
        ),
        averageFieldConfidence:
          confidenceCount > 0
            ? Math.round(totalConfidence / confidenceCount)
            : 0,
        topPerformingTemplates,
        sampleSize,
        truncated,
      };
    } catch (error) {
      console.error("Error getting aggregate statistics for user:", error);
      return {
        totalSessions: 0,
        completedSessions: 0,
        completionRate: 0,
        averageSessionDuration: 0,
        averageFieldsPopulated: 0,
        averageFieldConfidence: 0,
        topPerformingTemplates: [],
        sampleSize: 0,
        truncated: false,
      };
    }
  }

  /**
   * Get aggregate statistics across all interviews
   */
  static async getAggregateStatistics(): Promise<{
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
    averageSessionDuration: number;
    averageFieldsPopulated: number;
    averageFieldConfidence: number;
    topPerformingTemplates: Array<{
      templateId: string;
      completionRate: number;
      sessionCount: number;
    }>;
    sampleSize: number;
    truncated: boolean;
  }> {
    try {
      const where = {};
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          status: true,
          formTemplateId: true,
          startedAt: true,
          completedAt: true,
          autoPopulatedFields: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_SESSIONS_PER_ANALYTICS_QUERY,
      });

      const completedSessions = sessions.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const completionRate =
        sessions.length > 0
          ? Math.round((completedSessions / sessions.length) * 100)
          : 0;

      let totalDuration = 0;
      let durationCount = 0;
      let totalFieldsPopulated = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;

      sessions.forEach((session) => {
        const duration = sessionDurationSeconds(
          session.startedAt,
          session.completedAt,
        );
        if (duration !== null) {
          totalDuration += duration;
          durationCount++;
        }

        const { count, confidences } = parseAutoPopulatedFieldStats(
          session.autoPopulatedFields,
        );
        totalFieldsPopulated += count;
        confidences.forEach((confidence) => {
          totalConfidence += confidence;
          confidenceCount++;
        });
      });

      // Get top performing templates
      const templateStats = sessions.reduce(
        (acc, session) => {
          if (!acc[session.formTemplateId]) {
            acc[session.formTemplateId] = { completed: 0, total: 0 };
          }
          acc[session.formTemplateId].total++;
          if (session.status === "COMPLETED") {
            acc[session.formTemplateId].completed++;
          }
          return acc;
        },
        {} as Record<string, { completed: number; total: number }>,
      );

      const topPerformingTemplates = Object.entries(templateStats)
        .map(([templateId, { completed, total }]) => ({
          templateId,
          completionRate: Math.round((completed / total) * 100),
          sessionCount: total,
        }))
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 5);

      const { sampleSize, truncated } = await getSampleMeta(
        where,
        sessions.length,
      );

      return {
        totalSessions: sessions.length,
        completedSessions,
        completionRate,
        averageSessionDuration:
          durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        averageFieldsPopulated: Math.round(
          totalFieldsPopulated / Math.max(sessions.length, 1),
        ),
        averageFieldConfidence:
          confidenceCount > 0
            ? Math.round(totalConfidence / confidenceCount)
            : 0,
        topPerformingTemplates,
        sampleSize,
        truncated,
      };
    } catch (error) {
      console.error("Error getting aggregate statistics:", error);
      return {
        totalSessions: 0,
        completedSessions: 0,
        completionRate: 0,
        averageSessionDuration: 0,
        averageFieldsPopulated: 0,
        averageFieldConfidence: 0,
        topPerformingTemplates: [],
        sampleSize: 0,
        truncated: false,
      };
    }
  }
}
