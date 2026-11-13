import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";
import { dispatchPulseNotification } from "@/lib/pulse/dispatcher";
import { buildDailyDigest } from "@/lib/pulse/digest";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";
import { countBusinessDaysBetween } from "@/lib/pulse/business-days";
import { auDateKey } from "@/lib/pulse/au-date";
import { reportError } from "@/lib/observability";

/**
 * Restoration Pulse daily digest + Code of Practice cron handler
 * (RA-6951, epic RA-6948).
 *
 * Two independent per-job checks, both routed through the same
 * dispatchPulseNotification (so the per-job toggle, opt-out, missing-env,
 * and idempotency guards all apply — this handler never bypasses them):
 *
 *  1. Daily digest — "X of Y areas at drying goal" from the curated drying
 *     timeline (lib/portal/drying-timeline.ts), at most once per AU-local
 *     calendar day per job (the DAILY_DIGEST idempotency key is
 *     `<inspectionId>:DAILY_DIGEST:digest:<date>`).
 *
 *  2. 20-business-day Code of Practice update — General Insurance Code of
 *     Practice cadence. A "client-visible update" is any ClientCommsLog row
 *     with status SENT for the job (step transition, drying-goal change,
 *     digest, or a prior CoP update — there is no other durable record of a
 *     client-visible push; the portal feed itself is a live, unstored
 *     projection). Skipped for a job when today's digest just sent
 *     successfully, since that digest IS today's client-visible update.
 */

// Active = not yet in a terminal/closed InspectionStatus (see the enum
// comments in prisma/schema.prisma: COMPLETED/REJECTED/IN_BILLING/CLOSED/
// ARCHIVED are all terminal).
const ACTIVE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
] as const;

const COP_BUSINESS_DAYS_THRESHOLD = 20;

// A send holds its row as PENDING for seconds. Older than this, the process died
// mid-send, and whether the client got the email is unknown.
const STALE_PENDING_MS = 10 * 60 * 1000;
const SEND_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Counted every run, zero included, so a clean reading proves the check ran.
 * A failure here reports and returns null rather than stopping the digest.
 */
async function readSendHealth(now: Date) {
  try {
    const [stalePending, sendFailed] = await Promise.all([
      prisma.clientCommsLog.count({
        where: {
          status: "PENDING",
          createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) },
        },
      }),
      prisma.clientCommsLog.count({
        where: {
          status: "SUPPRESSED",
          suppressionReason: "SEND_FAILED",
          createdAt: { gte: new Date(now.getTime() - SEND_HEALTH_WINDOW_MS) },
        },
      }),
    ]);
    if (stalePending > 0 || sendFailed > 0) {
      reportError(
        new Error(
          `[pulse] ${stalePending} stale pending and ${sendFailed} failed client emails`,
        ),
        { stage: "pulse:send-health", connector: "mailtrap" },
      );
    }
    return { stalePending, sendFailed };
  } catch (err) {
    reportError(err, { stage: "pulse:send-health" });
    return null;
  }
}

export async function runPulseDigest(): Promise<CronJobResult> {
  const now = new Date();
  const dateKey = auDateKey(now);
  const sendHealth = await readSendHealth(now);

  const jobs = await prisma.inspection.findMany({
    where: { pulseEnabled: true, status: { in: [...ACTIVE_STATUSES] } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      report: { select: { id: true, status: true } },
      affectedAreas: { select: { id: true, roomZoneId: true } },
      moistureReadings: {
        select: {
          location: true,
          surfaceType: true,
          moistureLevel: true,
          recordedAt: true,
        },
      },
    },
    take: 1000, // CLAUDE.md rule 3 — explicit bound on every findMany
  });

  if (jobs.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: {
        digestsSent: 0,
        copUpdatesSent: 0,
        jobsConsidered: 0,
        sendHealth,
      },
    };
  }

  const inspectionIds = jobs.map((j) => j.id);
  const reportIds = jobs
    .map((j) => j.report?.id)
    .filter((id): id is string => Boolean(id));

  // Batched lookups (4 queries regardless of job count) rather than N+1 per
  // job — mirrors the shape of app/api/portal/[token]/updates/route.ts but
  // fanned out across every active Pulse job in one cron pass.
  const [dryingGoals, workflows, pendingApprovals, lastSentRows] =
    await Promise.all([
      prisma.dryingGoalRecord.findMany({
        where: { inspectionId: { in: inspectionIds } },
        select: { inspectionId: true, targetCategory: true, targetClass: true },
      }),
      prisma.inspectionWorkflow.findMany({
        where: { inspectionId: { in: inspectionIds } },
        select: { inspectionId: true, submissionScore: true },
      }),
      reportIds.length
        ? prisma.reportApproval.findMany({
            where: { reportId: { in: reportIds }, status: "PENDING" },
            select: { id: true, approvalType: true, reportId: true },
          })
        : Promise.resolve([]),
      prisma.clientCommsLog.groupBy({
        by: ["inspectionId"],
        where: { inspectionId: { in: inspectionIds }, status: "SENT" },
        _max: { createdAt: true },
      }),
    ]);

  const dryingGoalByJob = new Map(dryingGoals.map((d) => [d.inspectionId, d]));
  const workflowByJob = new Map(workflows.map((w) => [w.inspectionId, w]));
  const approvalsByReport = new Map<string, typeof pendingApprovals>();
  for (const approval of pendingApprovals) {
    const list = approvalsByReport.get(approval.reportId) ?? [];
    list.push(approval);
    approvalsByReport.set(approval.reportId, list);
  }
  const lastSentAtByJob = new Map(
    lastSentRows.map((row) => [row.inspectionId, row._max.createdAt]),
  );

  let digestsSent = 0;
  let copUpdatesSent = 0;

  for (const job of jobs) {
    const dryingGoal = dryingGoalByJob.get(job.id);
    const digest = buildDailyDigest({
      areas: job.affectedAreas,
      readings: job.moistureReadings,
      targetCategory: dryingGoal?.targetCategory,
      targetClass: dryingGoal?.targetClass,
      now,
    });

    let digestSentThisRun = false;
    if (digest) {
      const result = await dispatchPulseNotification({
        inspectionId: job.id,
        event: { type: "DAILY_DIGEST", digest, date: dateKey },
      });
      if (result.status === "SENT") {
        digestsSent++;
        digestSentThisRun = true;
      }
    }

    // A digest that sent just now IS today's client-visible update — no need
    // to also fire the CoP backstop for this job on this run.
    if (digestSentThisRun) continue;

    const lastSentAt = lastSentAtByJob.get(job.id) ?? job.createdAt;
    const businessDaysElapsed = countBusinessDaysBetween(lastSentAt, now);
    if (businessDaysElapsed < COP_BUSINESS_DAYS_THRESHOLD) continue;

    const workflow = workflowByJob.get(job.id) ?? null;
    const approvals = job.report
      ? (approvalsByReport.get(job.report.id) ?? [])
      : [];
    const feed = buildClientStatusFeed({
      status: job.status,
      workflow: workflow ? { submissionScore: workflow.submissionScore } : null,
      reportStatus: job.report?.status ?? null,
      pendingApprovals: approvals.map((a) => ({
        id: a.id,
        approvalType: a.approvalType,
      })),
    });

    const result = await dispatchPulseNotification({
      inspectionId: job.id,
      event: { type: "COP_UPDATE", feed, date: dateKey },
    });
    if (result.status === "SENT") copUpdatesSent++;
  }

  return {
    itemsProcessed: jobs.length,
    metadata: {
      digestsSent,
      copUpdatesSent,
      jobsConsidered: jobs.length,
      sendHealth,
    },
  };
}
