import { describe, it, expect } from "vitest";
import {
  analyzeCronHealth,
  renderCronAlertHtml,
  type CronExpectation,
  type CronJobSummary,
} from "../expected-jobs";

const NOW = new Date("2026-07-10T16:30:00.000Z");

const daily: CronExpectation = {
  path: "sync-ascora-historical",
  jobName: "sync-ascora-historical",
  label: "Ascora historical sync",
  maxStalenessMinutes: 28 * 60,
};
const fast: CronExpectation = {
  path: "process-emails",
  jobName: "process-emails",
  label: "Outbound email queue",
  maxStalenessMinutes: 20,
};

function minsAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

describe("analyzeCronHealth", () => {
  it("flags a job that never succeeded (the real Ascora 4-night failure)", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "sync-ascora-historical", lastSuccessAt: null, consecutiveFailures: 4 },
    ];
    const report = analyzeCronHealth([daily], summaries, NOW);
    expect(report.healthy).toBe(false);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({
      jobName: "sync-ascora-historical",
      kind: "never_succeeded",
      consecutiveFailures: 4,
    });
  });

  it("flags a job with NO runs at all as never_succeeded", () => {
    const report = analyzeCronHealth([daily], [], NOW);
    expect(report.healthy).toBe(false);
    expect(report.problems[0].kind).toBe("never_succeeded");
    expect(report.problems[0].consecutiveFailures).toBe(0);
  });

  it("flags a stale job whose last success is past its budget", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "sync-ascora-historical", lastSuccessAt: minsAgo(30 * 60), consecutiveFailures: 0 },
    ];
    const report = analyzeCronHealth([daily], summaries, NOW);
    expect(report.problems[0].kind).toBe("stale");
    expect(report.problems[0].stalenessMinutes).toBe(30 * 60);
  });

  it("does NOT flag a job that succeeded within its budget", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "sync-ascora-historical", lastSuccessAt: minsAgo(60), consecutiveFailures: 0 },
    ];
    const report = analyzeCronHealth([daily], summaries, NOW);
    expect(report.healthy).toBe(true);
    expect(report.problems).toHaveLength(0);
  });

  it("flags a fresh-but-flapping job at the failure threshold", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "process-emails", lastSuccessAt: minsAgo(6), consecutiveFailures: 2 },
    ];
    const report = analyzeCronHealth([fast], summaries, NOW);
    expect(report.problems[0].kind).toBe("failing");
  });

  it("does NOT flag a single transient failure below the threshold", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "process-emails", lastSuccessAt: minsAgo(6), consecutiveFailures: 1 },
    ];
    const report = analyzeCronHealth([fast], summaries, NOW);
    expect(report.healthy).toBe(true);
  });

  it("respects a custom failureThreshold", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "process-emails", lastSuccessAt: minsAgo(6), consecutiveFailures: 2 },
    ];
    const report = analyzeCronHealth([fast], summaries, NOW, { failureThreshold: 3 });
    expect(report.healthy).toBe(true);
  });

  it("boundary: exactly at the staleness budget is still healthy", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "process-emails", lastSuccessAt: minsAgo(20), consecutiveFailures: 0 },
    ];
    const report = analyzeCronHealth([fast], summaries, NOW);
    expect(report.healthy).toBe(true);
  });

  it("reports monitoredCount and only surfaces the unhealthy subset", () => {
    const summaries: CronJobSummary[] = [
      { jobName: "process-emails", lastSuccessAt: minsAgo(1), consecutiveFailures: 0 },
      { jobName: "sync-ascora-historical", lastSuccessAt: null, consecutiveFailures: 3 },
    ];
    const report = analyzeCronHealth([fast, daily], summaries, NOW);
    expect(report.monitoredCount).toBe(2);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].jobName).toBe("sync-ascora-historical");
  });
});

describe("renderCronAlertHtml", () => {
  it("renders each problem and escapes html", () => {
    const report = analyzeCronHealth(
      [{ ...daily, label: "A & B <sync>" }],
      [{ jobName: "sync-ascora-historical", lastSuccessAt: null, consecutiveFailures: 4 }],
      NOW,
    );
    const html = renderCronAlertHtml(report);
    expect(html).toContain("cron health alert");
    expect(html).toContain("A &amp; B &lt;sync&gt;");
    expect(html).toContain("sync-ascora-historical");
    expect(html).not.toContain("A & B <sync>");
  });
});
