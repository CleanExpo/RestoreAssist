import { beforeEach, describe, expect, it, vi } from "vitest";

const interviewSessionFindMany = vi.fn();
const interviewSessionCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewSession: {
      findMany: (...args: unknown[]) => interviewSessionFindMany(...args),
      count: (...args: unknown[]) => interviewSessionCount(...args),
    },
  },
}));

import { InterviewAnalyticsService } from "../interview-analytics-service";

beforeEach(() => {
  interviewSessionFindMany.mockReset();
  interviewSessionCount.mockReset();
  interviewSessionFindMany.mockResolvedValue([]);
  interviewSessionCount.mockResolvedValue(0);
});

describe("InterviewAnalyticsService — bounded queries (RA-6968)", () => {
  it("getUserAnalyticsSummary caps rows with take and does not pull the full responses relation", async () => {
    await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    const arg = interviewSessionFindMany.mock.calls[0][0];
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
    expect(arg.include).toBeUndefined();
    // Must not silently fetch every nested response row.
    expect(JSON.stringify(arg.select ?? {})).not.toContain("responses");
  });

  it("getAggregateStatistics (no where clause — the worst offender) still caps with take", async () => {
    await InterviewAnalyticsService.getAggregateStatistics();

    const arg = interviewSessionFindMany.mock.calls[0][0];
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
  });

  it("getAggregateStatisticsForUser caps with take, scoped to the given user", async () => {
    await InterviewAnalyticsService.getAggregateStatisticsForUser("user_2");

    const arg = interviewSessionFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "user_2" });
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
  });

  it("getTemplatePerformanceAnalytics caps with take and selects questionId + answerValue on nested responses", async () => {
    await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
      "template_1",
    );

    const arg = interviewSessionFindMany.mock.calls[0][0];
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
    expect(arg.select.responses).toEqual({
      select: { questionId: true, answerValue: true },
    });
  });

  it("still computes correct aggregates from a bounded result set", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      { status: "COMPLETED", formTemplateId: "t1" },
      { status: "ABANDONED", formTemplateId: "t1" },
    ]);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary.totalInterviewsSessions).toBe(2);
    expect(summary.completedSessions).toBe(1);
    expect(summary.abandonedSessions).toBe(1);
    expect(summary.completionRate).toBe(50);
  });
});

describe("InterviewAnalyticsService — silent truncation signal (RA-6975)", () => {
  it("getUserAnalyticsSummary reports sampleSize and truncated=false when under the cap", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      { status: "COMPLETED", formTemplateId: "t1" },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary.sampleSize).toBe(1);
    expect(summary.truncated).toBe(false);
  });

  it("getUserAnalyticsSummary flags truncated=true when the account has more sessions than the cap sampled", async () => {
    const capped = Array.from({ length: 5000 }, () => ({
      status: "COMPLETED",
      formTemplateId: "t1",
    }));
    interviewSessionFindMany.mockResolvedValueOnce(capped);
    // The account actually has more sessions than the 5000-row cap.
    interviewSessionCount.mockResolvedValueOnce(7300);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary.sampleSize).toBe(5000);
    expect(summary.truncated).toBe(true);
  });

  it("getTemplatePerformanceAnalytics flags truncated=true when the template has more sessions than sampled", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      { status: "COMPLETED", responses: [] },
    ]);
    interviewSessionCount.mockResolvedValueOnce(9000);

    const analytics =
      await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
        "template_1",
      );

    expect(analytics.sampleSize).toBe(1);
    expect(analytics.truncated).toBe(true);
  });

  it("getAggregateStatistics and getAggregateStatisticsForUser both surface sampleSize/truncated", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([]);
    const aggregate = await InterviewAnalyticsService.getAggregateStatistics();
    expect(aggregate.sampleSize).toBe(0);
    expect(aggregate.truncated).toBe(false);

    interviewSessionFindMany.mockResolvedValueOnce([
      { status: "COMPLETED", formTemplateId: "t1" },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);
    const forUser =
      await InterviewAnalyticsService.getAggregateStatisticsForUser("user_1");
    expect(forUser.sampleSize).toBe(1);
    expect(forUser.truncated).toBe(false);
  });

  it("does not run a count query when the sample is already empty", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([]);

    await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(interviewSessionCount).not.toHaveBeenCalled();
  });
});

describe("InterviewAnalyticsService — dead-metric fix (RA-6975)", () => {
  it("computes averageFieldConfidence and totalFieldsAutoPopulated from the real autoPopulatedFields JSON column, not the nonexistent metadata field", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      {
        status: "COMPLETED",
        formTemplateId: "t1",
        startedAt: null,
        completedAt: null,
        autoPopulatedFields: JSON.stringify({
          field_a: { value: "x", confidence: 80 },
          field_b: { value: "y", confidence: 100 },
        }),
      },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary.totalFieldsAutoPopulated).toBe(2);
    expect(summary.averageFieldConfidence).toBe(90);
  });

  it("computes averageSessionDurationSeconds from real startedAt/completedAt, not the nonexistent metadata field", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      {
        status: "COMPLETED",
        formTemplateId: "t1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: new Date("2026-01-01T00:10:00.000Z"),
        autoPopulatedFields: null,
      },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary.averageSessionDurationSeconds).toBe(600);
  });

  it("no longer exposes averageConflicts — the field never had a real backing column", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      { status: "COMPLETED", formTemplateId: "t1" },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const summary =
      await InterviewAnalyticsService.getUserAnalyticsSummary("user_1");

    expect(summary).not.toHaveProperty("averageConflicts");
  });

  it("detects skipped questions from the real answerValue field, not the nonexistent answer field", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      {
        status: "COMPLETED",
        startedAt: null,
        completedAt: null,
        autoPopulatedFields: null,
        responses: [
          { questionId: "q1", answerValue: "a real answer" },
          { questionId: "q1", answerValue: "another real answer" },
        ],
      },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const analytics =
      await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
        "template_1",
      );

    // Both responses to q1 have a real, non-empty answerValue, so it must
    // not be reported as a difficult (high skip-rate) question.
    expect(
      analytics.mostDifficultQuestions.find((q) => q.questionId === "q1"),
    ).toBeUndefined();
  });

  it("still counts a genuinely empty answerValue as a skip", async () => {
    interviewSessionFindMany.mockResolvedValueOnce([
      {
        status: "COMPLETED",
        startedAt: null,
        completedAt: null,
        autoPopulatedFields: null,
        responses: [
          { questionId: "q1", answerValue: "" },
          { questionId: "q1", answerValue: null },
        ],
      },
    ]);
    interviewSessionCount.mockResolvedValueOnce(1);

    const analytics =
      await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
        "template_1",
      );

    const q1 = analytics.mostDifficultQuestions.find(
      (q) => q.questionId === "q1",
    );
    expect(q1?.skipRate).toBe(100);
  });
});
