import { beforeEach, describe, expect, it, vi } from "vitest";

const interviewSessionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewSession: {
      findMany: (...args: unknown[]) => interviewSessionFindMany(...args),
    },
  },
}));

import { InterviewAnalyticsService } from "../interview-analytics-service";

beforeEach(() => {
  interviewSessionFindMany.mockReset();
  interviewSessionFindMany.mockResolvedValue([]);
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

  it("getTemplatePerformanceAnalytics caps with take and only selects questionId on nested responses", async () => {
    await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
      "template_1",
    );

    const arg = interviewSessionFindMany.mock.calls[0][0];
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
    expect(arg.select.responses).toEqual({ select: { questionId: true } });
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
