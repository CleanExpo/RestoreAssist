/**
 * Restoration Pulse notification dispatcher (RA-6949, epic RA-6948).
 *
 * Event-triggered service that maps client-visible step transitions
 * (buildClientStatusFeed steps), drying-goal changes, the daily digest
 * (RA-6951), and the 20-business-day Code of Practice update (RA-6951) to
 * templated Mailtrap emails. Every dispatch writes exactly one ClientCommsLog
 * row:
 *   - a row reserved as PENDING, which becomes SENT once Mailtrap accepts the
 *     email and SUPPRESSED/SEND_FAILED when it does not, or
 *   - a SUPPRESSED row (with a machine-readable reason) when no send is tried.
 * A PENDING row left behind means the process died mid-send. It is never read
 * as delivered, so it cannot reset the Code of Practice clock, and it is never
 * resent because Mailtrap may already have accepted the email.
 *
 * Suppression reasons: the per-job Pulse toggle is off (mid-dispute kill
 * switch, judge AC6), the homeowner opted out, no recipient, the workspace
 * lacks the CLIENT_COMMS entitlement (RA-6954), the Mailtrap/app env is unset
 * (fail-closed with connector-health visibility, mirroring lib/email.ts), or
 * the logical event was already dispatched (duplicate).
 *
 * Curated states only: the dispatcher accepts only the curated portal
 * projections (ClientFeed / AreaDryingState[] / DailyDigestData) — raw
 * moisture/meter values are never passed in, so they can never leak into a
 * notification.
 */

import { pickPortalToken } from "@/lib/pulse/pick-portal-token";
import { randomUUID } from "crypto";
import { resolveClientRecipient } from "@/lib/client-recipient";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";
import { sendPulseUpdateEmail } from "@/lib/email";
import { requireAddonForResource } from "@/lib/entitlements";
import {
  renderCodeOfPracticeUpdateEmail,
  renderDailyDigestEmail,
  renderDryingUpdateEmail,
  renderStepTransitionEmail,
  type PulseTemplateKey,
  type RenderedPulseEmail,
} from "./templates";
import type { ClientFeed } from "@/lib/portal/client-status-feed";
import {
  isAreaAtDryingGoal,
  type AreaDryingState,
} from "@/lib/portal/drying-timeline";
import type { DailyDigestData } from "./digest";
import {
  buildPulseOneClickUnsubscribeUrl,
  buildPulseUnsubscribeUrl,
} from "./pulse-unsubscribe-token";
import { isPulseOptedOutByAddress } from "./opt-out";

export type PulseEventType =
  | "STEP_TRANSITION"
  | "DRYING_GOAL_CHANGE"
  | "DAILY_DIGEST"
  | "COP_UPDATE";

export type PulseEvent =
  | { type: "STEP_TRANSITION"; feed: ClientFeed }
  // `date` (YYYY-MM-DD, AU-local) is the key, so the unique constraint holds a
  // job to one drying email per AU day however many readings arrive.
  | { type: "DRYING_GOAL_CHANGE"; areas: AreaDryingState[]; date: string }
  // `date` (YYYY-MM-DD, AU-local) is folded into the idempotency key below —
  // it IS the once-per-day guarantee: a second dispatch for the same job on
  // the same date collides on the unique idempotencyKey and is suppressed.
  | { type: "DAILY_DIGEST"; digest: DailyDigestData; date: string }
  | { type: "COP_UPDATE"; feed: ClientFeed; date: string };

export type PulseSuppressionReason =
  | "TOGGLE_OFF"
  | "OPT_OUT"
  | "NO_RECIPIENT"
  | "NOT_ENTITLED"
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
 * the SENDER_EMAIL guard in lib/email.ts (never silently send from the
 * sandbox / to a broken link).
 */
function pulseEnvConfigured(): boolean {
  return Boolean(
    process.env.MAILTRAP_API_KEY &&
      process.env.SENDER_EMAIL &&
      process.env.NEXT_PUBLIC_APP_URL,
  );
}

/**
 * Stable fingerprint of the logical event. Two dispatches for the same logical
 * event share a key (deduped). A step is identified by the step alone: the
 * percentage can move while the client's step does not, and that is not news.
 */
function eventFingerprint(event: PulseEvent): string {
  switch (event.type) {
    case "STEP_TRANSITION":
      return `step:${event.feed.currentStep}`;
    case "DRYING_GOAL_CHANGE":
      return `drying:${event.date}`;
    case "DAILY_DIGEST":
      return `digest:${event.date}`;
    case "COP_UPDATE":
      return `cop:${event.date}`;
  }
}

const TEMPLATE_KEYS: Record<PulseEventType, PulseTemplateKey> = {
  STEP_TRANSITION: "pulse-step-transition",
  DRYING_GOAL_CHANGE: "pulse-drying-update",
  DAILY_DIGEST: "pulse-daily-digest",
  COP_UPDATE: "pulse-cop-update",
};

const DRYING_STATE_SEPARATOR = "#";

/** What the client was told about one area. Reaching the goal counts as news. */
function dryingAreaState(area: AreaDryingState): string {
  return isAreaAtDryingGoal(area) ? "at-goal" : area.status;
}

/**
 * The drying state a row told the client, held on the row's template key so no
 * column is needed. notifyClientDryingChange reads it back to detect a change.
 */
function dryingTemplateKey(areas: AreaDryingState[]): string {
  const state = areas
    .map((area) => `${area.areaId}=${dryingAreaState(area)}`)
    .sort()
    .join(",");
  return `${TEMPLATE_KEYS.DRYING_GOAL_CHANGE}${DRYING_STATE_SEPARATOR}${state}`;
}

export function parseDryingTemplateKey(
  templateKey: string | null | undefined,
): Map<string, string> {
  const state = templateKey?.split(DRYING_STATE_SEPARATOR)[1];
  const parsed = new Map<string, string>();
  for (const part of state ? state.split(",") : []) {
    const [areaId, areaState] = part.split("=");
    if (areaId && areaState) parsed.set(areaId, areaState);
  }
  return parsed;
}

export function dryingAreaStates(
  areas: AreaDryingState[],
): Map<string, string> {
  return parseDryingTemplateKey(dryingTemplateKey(areas));
}

function buildPortalUrl(token: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return token ? `${base}/portal/${token}` : `${base}/portal`;
}

function render(
  event: PulseEvent,
  portalUrl: string,
  unsubscribeUrl?: string,
): RenderedPulseEmail {
  switch (event.type) {
    case "STEP_TRANSITION":
      return renderStepTransitionEmail(event.feed, portalUrl, unsubscribeUrl);
    case "DRYING_GOAL_CHANGE":
      return renderDryingUpdateEmail(event.areas, portalUrl, unsubscribeUrl);
    case "DAILY_DIGEST":
      return renderDailyDigestEmail(event.digest, portalUrl, unsubscribeUrl);
    case "COP_UPDATE":
      return renderCodeOfPracticeUpdateEmail(
        event.feed,
        portalUrl,
        unsubscribeUrl,
      );
  }
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

  const clientSelect = {
    id: true,
    email: true,
    pulseOptOut: true,
    portalAccounts: {
      // This job's link, or one issued before binding existed. The filter sits
      // in the query so `take` can never cut off the bound link behind newer
      // links for other jobs.
      where: {
        revokedAt: null,
        OR: [{ inspectionId }, { inspectionId: null }],
      },
      orderBy: { createdAt: "desc" as const },
      take: 25,
      select: { token: true, inspectionId: true, createdAt: true },
    },
  };

  const job = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      pulseEnabled: true,
      report: { select: { client: { select: clientSelect } } },
      client: { select: clientSelect },
    },
  });

  if (!job) {
    throw new Error(`[pulse] inspection ${inspectionId} not found`);
  }

  const linkedClients = [job.report?.client, job.client].filter(
    (linked): linked is NonNullable<typeof linked> => Boolean(linked),
  );
  const resolved = resolveClientRecipient({
    reportClient: job.report?.client,
    inspectionClient: job.client,
  });
  const client = resolved?.client ?? null;
  const recipient = resolved?.email ?? "";
  const logicalKey = `${inspectionId}:${event.type}:${eventFingerprint(event)}`;

  const base = {
    inspectionId,
    channel: CHANNEL_EMAIL,
    eventType: event.type,
    recipient,
    templateKey:
      event.type === "DRYING_GOAL_CHANGE"
        ? dryingTemplateKey(event.areas)
        : TEMPLATE_KEYS[event.type],
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
  // Either linked record opting out stops the send, even when the other record
  // is the one that holds the address.
  if (linkedClients.some((linked) => linked.pulseOptOut)) {
    return suppress("OPT_OUT");
  }
  if (!recipient || !client) return suppress("NO_RECIPIENT");
  if (await isPulseOptedOutByAddress(job.userId, recipient)) {
    return suppress("OPT_OUT");
  }
  // RA-6954 — client-comms send requires the CLIENT_COMMS entitlement.
  // Internal status reads (the portal feed itself) are never gated — only
  // this SEND path is.
  // RA-7893: the CLIENT_COMMS of the business the JOB belongs to — not of an
  // organisation its creator joined after creating it.
  const addonGate = await requireAddonForResource(
    job.userId,
    job.createdAt,
    "CLIENT_COMMS",
  );
  if (!addonGate.allowed) return suppress("NOT_ENTITLED");

  // Fail closed with a row when the unsubscribe secret is missing: an email
  // with no way out must not go, and a throw here would leave no record.
  let unsubscribeUrl: string | undefined;
  let oneClickUrl: string | undefined;
  try {
    unsubscribeUrl = buildPulseUnsubscribeUrl(client.id, recipient);
    oneClickUrl = buildPulseOneClickUnsubscribeUrl(client.id, recipient);
  } catch {
    unsubscribeUrl = undefined;
  }
  if (!pulseEnvConfigured() || !unsubscribeUrl) {
    reportError(
      new Error(
        "[pulse] Mailtrap, app-url or unsubscribe secret env not configured — notification suppressed",
      ),
      { stage: "pulse:dispatch", inspectionId, connector: "mailtrap" },
    );
    return suppress("MISSING_ENV");
  }

  const token = pickPortalToken(client.portalAccounts, inspectionId);
  const rendered = render(event, buildPortalUrl(token), unsubscribeUrl);

  // Reserve the logical event atomically. The unique idempotencyKey guarantees
  // at most one send per logical event, so a duplicate dispatch cannot send a
  // second email — a unique-constraint collision (P2002) is a duplicate.
  let reservedId: string;
  try {
    const reserved = await prisma.clientCommsLog.create({
      data: { ...base, status: "PENDING", idempotencyKey: logicalKey },
      select: { id: true },
    });
    reservedId = reserved.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return suppress("DUPLICATE");
    }
    throw err;
  }

  let messageId: string | null;
  try {
    messageId = await sendPulseUpdateEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      listUnsubscribeUrl: oneClickUrl,
    });
  } catch (err) {
    reportError(err, { stage: "pulse:send", inspectionId });
    try {
      await prisma.clientCommsLog.update({
        where: { id: reservedId },
        data: { status: "SUPPRESSED", suppressionReason: "SEND_FAILED" },
      });
    } catch (writeErr) {
      reportError(writeErr, { stage: "pulse:send-failed-write", inspectionId });
    }
    return { status: "SUPPRESSED", reason: "SEND_FAILED", logId: reservedId };
  }

  // The email has gone. A failed log write must not read as a failed send.
  try {
    await prisma.clientCommsLog.update({
      where: { id: reservedId },
      data: { status: "SENT", providerMessageId: messageId },
    });
  } catch (err) {
    reportError(err, { stage: "pulse:log-update", inspectionId });
  }
  return {
    status: "SENT",
    logId: reservedId,
    templateKey: rendered.templateKey,
  };
}
