import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import {
  MONITORED_CRONS,
  analyzeCronHealth,
  renderCronAlertHtml,
  type CronJobSummary,
} from "@/lib/cron/expected-jobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cron-watchdog — RA-7026 follow-up.
 *
 * The detection layer that makes silent cron failures impossible to miss.
 * Reads the CronJobRun audit table, computes each monitored job's last
 * success + consecutive failures, and — when anything is never-succeeded,
 * stale, or repeatedly failing — emails the operator a digest.
 *
 * Why this exists: the Ascora historical sync failed for four straight nights
 * with every failure recorded in CronJobRun, yet nothing told anyone. This
 * closes that gap.
 *
 * Recipient: CRON_ALERT_EMAIL. If unset the run still SUCCEEDS (so the watchdog
 * itself never pages) but logs loudly that alerts are unconfigured.
 */

/** Bound the "never succeeded" failure count; must exceed the weekly cadence. */
const LOOKBACK_DAYS = 14;

async function buildSummary(jobName: string, windowStart: Date): Promise<CronJobSummary> {
  const lastSuccess = await prisma.cronJobRun.findFirst({
    where: { jobName, status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  const consecutiveFailures = await prisma.cronJobRun.count({
    where: lastSuccess
      ? { jobName, status: "failed", startedAt: { gt: lastSuccess.startedAt } }
      : { jobName, status: "failed", startedAt: { gte: windowStart } },
  });

  return {
    jobName,
    lastSuccessAt: lastSuccess?.startedAt ?? null,
    consecutiveFailures,
  };
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("cron-watchdog", async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const summaries = await Promise.all(
      MONITORED_CRONS.map((c) => buildSummary(c.jobName, windowStart)),
    );

    const report = analyzeCronHealth(MONITORED_CRONS, summaries, now);

    let alerted = false;
    if (!report.healthy) {
      const to = process.env.CRON_ALERT_EMAIL?.trim();
      if (to) {
        await sendEmail({
          to,
          subject: `RestoreAssist cron alert: ${report.problems.length} job(s) unhealthy`,
          html: renderCronAlertHtml(report),
        });
        alerted = true;
      } else {
        console.error(
          "[cron-watchdog] CRON_ALERT_EMAIL unset — cron health problems detected but NOT emailed:",
          report.problems.map((p) => `${p.jobName}:${p.kind}`).join(", "),
        );
      }
    }

    return {
      itemsProcessed: report.problems.length,
      metadata: {
        healthy: report.healthy,
        monitoredCount: report.monitoredCount,
        alerted,
        problems: report.problems.map((p) => ({
          jobName: p.jobName,
          kind: p.kind,
          detail: p.detail,
        })),
      },
    };
  });

  return NextResponse.json(result);
}

/** POST — manual trigger (same auth), useful for testing the alert path. */
export async function POST(request: NextRequest) {
  return GET(request);
}
