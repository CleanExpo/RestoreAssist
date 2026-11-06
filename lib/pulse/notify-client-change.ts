/**
 * Pulse triggers: turn a job change into at most one client email (epic RA-6948).
 *
 * Called from every route that changes a job's status or its drying readings.
 * Neither function ever rejects, so a failed email cannot fail the request or
 * roll back the change. Call them fire-and-forget (`void notify...`, rule 13)
 * after the change has committed; they hold the request open themselves.
 *
 * Every exit logs one `[pulse:hook]` line, so "no email went out" can be told
 * apart from "the hook never ran".
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";
import {
  buildClientStatusFeed,
  clientStepRank,
} from "@/lib/portal/client-status-feed";
import { buildDryingTimeline } from "@/lib/portal/drying-timeline";
import { auDateKey } from "./au-date";
import {
  dispatchPulseNotification,
  dryingAreaStates,
  parseDryingTemplateKey,
  type PulseDispatchResult,
} from "./dispatcher";

const DRYING_EVENT = "DRYING_GOAL_CHANGE";

// More readings than any real job holds; a bound, not a business rule.
const MAX_READINGS = 5000;

/**
 * Keep the request alive until the email work ends, so a host that stops work
 * once the response is sent cannot strand a reservation at PENDING. Outside a
 * request (scripts) `after` throws, and there is nothing to extend.
 */
function holdRequestOpen(work: Promise<void>): Promise<void> {
  try {
    after(() => work);
  } catch {
    // Not in a request scope.
  }
  return work;
}

function logOutcome(
  inspectionId: string,
  kind: "step" | "drying",
  outcome: string,
  detail: Record<string, unknown> = {},
): void {
  console.info("[pulse:hook]", { inspectionId, kind, outcome, ...detail });
}

function dispatchOutcome(result: PulseDispatchResult): string {
  return result.status === "SENT" ? "sent" : `suppressed:${result.reason}`;
}

/**
 * Email the client when the job's client-visible step has moved forward from
 * `fromStatus`. The status is read fresh, so this reports what the job is now
 * rather than what the caller believed.
 */
export function notifyClientStepChange(input: {
  inspectionId: string;
  fromStatus: string;
}): Promise<void> {
  return holdRequestOpen(checkStepChange(input));
}

async function checkStepChange(input: {
  inspectionId: string;
  fromStatus: string;
}): Promise<void> {
  const { inspectionId, fromStatus } = input;
  try {
    const job = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: {
        status: true,
        report: { select: { id: true, status: true } },
      },
    });
    if (!job) {
      logOutcome(inspectionId, "step", "skipped:not_found");
      return;
    }
    if (clientStepRank(job.status) <= clientStepRank(fromStatus)) {
      logOutcome(inspectionId, "step", "skipped:not_forward", {
        from: fromStatus,
        to: job.status,
      });
      return;
    }

    const pendingApprovals = job.report
      ? await prisma.reportApproval.findMany({
          where: { reportId: job.report.id, status: "PENDING" },
          select: { id: true, approvalType: true },
          take: 25,
        })
      : [];
    // No submission score here: that number measures internal evidence
    // completeness, and an email must state the stage the client can check.
    const feed = buildClientStatusFeed({
      status: job.status,
      workflow: null,
      reportStatus: job.report?.status ?? null,
      pendingApprovals,
    });
    const result = await dispatchPulseNotification({
      inspectionId,
      event: { type: "STEP_TRANSITION", feed },
    });
    logOutcome(inspectionId, "step", dispatchOutcome(result));
  } catch (err) {
    reportError(err, {
      stage: "pulse:notify-step",
      inspectionId,
      eventType: "STEP_TRANSITION",
      kind: "step",
    });
    logOutcome(inspectionId, "step", "error");
  }
}

// Readings can land in bursts, so one check runs per job at a time. A call during
// a check may hold a change that check already read past, so it asks for one fresh
// check afterwards. The unique key still holds across servers.
const dryingInFlight = new Set<string>();
const dryingRecheck = new Set<string>();

/**
 * Email the client when an area they were told about has changed state, at most
 * once per AU day per job. The first state counts as a change, and so does an
 * area dropping out. An area appearing for the first time does not, because
 * nothing the client was told has moved.
 */
export function notifyClientDryingChange(inspectionId: string): Promise<void> {
  return holdRequestOpen(runDryingCheck(inspectionId));
}

async function runDryingCheck(inspectionId: string): Promise<void> {
  if (dryingInFlight.has(inspectionId)) {
    dryingRecheck.add(inspectionId);
    return;
  }
  dryingInFlight.add(inspectionId);
  try {
    do {
      dryingRecheck.delete(inspectionId);
      try {
        await checkDryingChange(inspectionId);
      } catch (err) {
        reportError(err, {
          stage: "pulse:notify-drying",
          inspectionId,
          eventType: DRYING_EVENT,
          kind: "drying",
        });
        logOutcome(inspectionId, "drying", "error");
      }
    } while (dryingRecheck.has(inspectionId));
  } finally {
    dryingInFlight.delete(inspectionId);
    dryingRecheck.delete(inspectionId);
  }
}

async function checkDryingChange(inspectionId: string): Promise<void> {
  // The cheap exits run first: this fires on every reading, and most jobs have
  // the toggle off or have already had today's email.
  const toggle = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { pulseEnabled: true },
  });
  if (!toggle) {
    logOutcome(inspectionId, "drying", "skipped:not_found");
    return;
  }
  // Per-reading path: a job with the toggle off writes no row per reading.
  if (!toggle.pulseEnabled) {
    logOutcome(inspectionId, "drying", "skipped:toggle_off");
    return;
  }

  // Any row today stops here, including a failed send or an opt-out, so a busy
  // reading day writes one row. A failed send is told on a later day.
  const now = new Date();
  const date = auDateKey(now);
  const lastAttempt = await prisma.clientCommsLog.findFirst({
    where: { inspectionId, eventType: DRYING_EVENT },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastAttempt && auDateKey(lastAttempt.createdAt) === date) {
    logOutcome(inspectionId, "drying", "skipped:same_day");
    return;
  }

  const job = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      affectedAreas: { select: { id: true, roomZoneId: true } },
      moistureReadings: {
        // A voided reading must never be what the client is told about.
        where: { invalidatedAt: null },
        select: {
          location: true,
          surfaceType: true,
          moistureLevel: true,
          recordedAt: true,
        },
        // Newest first, so the bound can only ever drop the oldest readings.
        orderBy: { recordedAt: "desc" },
        take: MAX_READINGS,
      },
    },
  });
  if (!job) {
    logOutcome(inspectionId, "drying", "skipped:not_found");
    return;
  }

  const goal = await prisma.dryingGoalRecord.findUnique({
    where: { inspectionId },
    select: { targetCategory: true, targetClass: true },
  });
  const areas = buildDryingTimeline({
    areas: job.affectedAreas,
    readings: [...job.moistureReadings].reverse(),
    targetCategory: goal?.targetCategory,
    targetClass: goal?.targetClass,
    now,
  });
  if (areas.length === 0) {
    logOutcome(inspectionId, "drying", "skipped:no_areas");
    return;
  }

  // Compare with what the client was actually sent. PENDING counts: Mailtrap
  // may have accepted that email before the process died.
  const lastSent = await prisma.clientCommsLog.findFirst({
    where: {
      inspectionId,
      eventType: DRYING_EVENT,
      status: { in: ["SENT", "PENDING"] },
    },
    orderBy: { createdAt: "desc" },
    select: { templateKey: true },
  });
  if (lastSent) {
    const told = parseDryingTemplateKey(lastSent.templateKey);
    // A row with no recorded state tells us nothing, so it cannot mean "same".
    const current = dryingAreaStates(areas);
    const changed =
      told.size === 0 ||
      [...told].some(([areaId, state]) => current.get(areaId) !== state);
    if (!changed) {
      logOutcome(inspectionId, "drying", "skipped:no_change");
      return;
    }
  }

  const result = await dispatchPulseNotification({
    inspectionId,
    event: { type: DRYING_EVENT, areas, date },
  });
  logOutcome(inspectionId, "drying", dispatchOutcome(result));
}
