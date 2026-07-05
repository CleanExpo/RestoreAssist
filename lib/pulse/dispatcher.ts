/**
 * Restoration Pulse notification dispatcher (RA-6949, epic RA-6948).
 *
 * Event-triggered service that maps client-visible step transitions
 * (buildClientStatusFeed steps) and drying-goal changes to templated Resend
 * emails. Every dispatch writes exactly one ClientCommsLog row:
 *   - a SENT row when the email goes out, or
 *   - a SUPPRESSED row (with a machine-readable reason) when it does not.
 *
 * Suppression reasons: the per-job Pulse toggle is off (mid-dispute kill
 * switch, judge AC6), the homeowner opted out, no recipient, the Resend/app
 * env is unset (fail-closed with connector-health visibility, mirroring
 * lib/email.ts), or the logical event was already dispatched (duplicate).
 *
 * Curated states only: the dispatcher accepts only the curated portal
 * projections (ClientFeed / AreaDryingState[]) — raw moisture/meter values are
 * never passed in, so they can never leak into a notification.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";
import { sendPulseUpdateEmail } from "@/lib/email";
import {
  renderDryingUpdateEmail,
  renderStepTransitionEmail,
  type RenderedPulseEmail,
} from "./templates";
import type { ClientFeed } from "@/lib/portal/client-status-feed";
import type { AreaDryingState } from "@/lib/portal/drying-timeline";

export type PulseEventType = "STEP_TRANSITION" | "DRYING_GOAL_CHANGE";

export type PulseEvent =
  | { type: "STEP_TRANSITION"; feed: ClientFeed }
  | { type: "DRYING_GOAL_CHANGE"; areas: AreaDryingState[] };

export type PulseSuppressionReason =
  | "TOGGLE_OFF"
  | "OPT_OUT"
  | "NO_RECIPIENT"
  | "MISSING_ENV"
  | "DUPLICATE"
  | "SEND_FAILED";

export interface PulseDispatchInput {
  inspectionId: string;
  event: PulseEvent;
}

export type PulseDispatchResult =
  | { status: "SENT"; logId: string; templateKey: string }
  | { status: "SUPPRESSED"; reason: PulseSuppressionReason; logId: string };

const CHANNEL_EMAIL = "EMAIL";

/**
 * Hard dependencies for a Pulse send. Missing any one fails closed — mirrors
 * the RESEND_FROM_EMAIL guard in lib/email.ts (never silently send from the
 * sandbox / to a broken link).
 */
function pulseEnvConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL &&
      process.env.NEXT_PUBLIC_APP_URL,
  );
}

/**
 * Stable fingerprint of the curated event state. Two dispatches carrying the
 * same client-visible state share a key (deduped); a genuine transition to a
 * new step or a changed drying state produces a new key (re-notifies).
 */
function eventFingerprint(event: PulseEvent): string {
  if (event.type === "STEP_TRANSITION") {
    return `step:${event.feed.currentStep}:${event.feed.progressPct}`;
  }
  return (
    "drying:" +
    event.areas
      .map((a) => `${a.areaId}=${a.status}`)
      .sort()
      .join(",")
  );
}

function buildPortalUrl(token: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return token ? `${base}/portal/${token}` : `${base}/portal`;
}

function render(event: PulseEvent, portalUrl: string): RenderedPulseEmail {
  return event.type === "STEP_TRANSITION"
    ? renderStepTransitionEmail(event.feed, portalUrl)
    : renderDryingUpdateEmail(event.areas, portalUrl);
}

/**
 * Dispatch a single Pulse notification for a job. Always returns a result and
 * always records a ClientCommsLog row — a suppression is a first-class,
 * audited outcome, not a silent no-op.
 */
export async function dispatchPulseNotification(
  input: PulseDispatchInput,
): Promise<PulseDispatchResult> {
  const { inspectionId, event } = input;

  const job = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      pulseEnabled: true,
      report: {
        select: {
          client: {
            select: {
              email: true,
              pulseOptOut: true,
              portalAccounts: {
                where: { revokedAt: null },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { token: true },
              },
            },
          },
        },
      },
    },
  });

  if (!job) {
    throw new Error(`[pulse] inspection ${inspectionId} not found`);
  }

  const client = job.report?.client ?? null;
  const recipient = client?.email ?? "";
  const token = client?.portalAccounts?.[0]?.token ?? null;
  const rendered = render(event, buildPortalUrl(token));
  const logicalKey = `${inspectionId}:${event.type}:${eventFingerprint(event)}`;

  const base = {
    inspectionId,
    channel: CHANNEL_EMAIL,
    eventType: event.type,
    recipient,
    templateKey: rendered.templateKey,
  };

  const suppress = async (
    reason: PulseSuppressionReason,
  ): Promise<PulseDispatchResult> => {
    const row = await prisma.clientCommsLog.create({
      data: {
        ...base,
        status: "SUPPRESSED",
        suppressionReason: reason,
        idempotencyKey: `${logicalKey}:${reason}:${randomUUID()}`,
      },
      select: { id: true },
    });
    return { status: "SUPPRESSED", reason, logId: row.id };
  };

  if (!job.pulseEnabled) return suppress("TOGGLE_OFF");
  if (client?.pulseOptOut) return suppress("OPT_OUT");
  if (!recipient) return suppress("NO_RECIPIENT");
  if (!pulseEnvConfigured()) {
    reportError(
      new Error(
        "[pulse] Resend/app-url env not configured — notification suppressed",
      ),
      { stage: "pulse:dispatch", inspectionId, connector: "resend" },
    );
    return suppress("MISSING_ENV");
  }

  // Reserve the logical event atomically. The unique idempotencyKey guarantees
  // at most one SENT row per logical event, so a duplicate dispatch cannot send
  // a second email — a unique-constraint collision (P2002) is a duplicate.
  let reservedId: string;
  try {
    const reserved = await prisma.clientCommsLog.create({
      data: { ...base, status: "SENT", idempotencyKey: logicalKey },
      select: { id: true },
    });
    reservedId = reserved.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return suppress("DUPLICATE");
    }
    throw err;
  }

  try {
    const messageId = await sendPulseUpdateEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await prisma.clientCommsLog.update({
      where: { id: reservedId },
      data: { providerMessageId: messageId },
    });
    return {
      status: "SENT",
      logId: reservedId,
      templateKey: rendered.templateKey,
    };
  } catch (err) {
    reportError(err, { stage: "pulse:send", inspectionId });
    await prisma.clientCommsLog.update({
      where: { id: reservedId },
      data: { status: "SUPPRESSED", suppressionReason: "SEND_FAILED" },
    });
    return { status: "SUPPRESSED", reason: "SEND_FAILED", logId: reservedId };
  }
}
