/**
 * Restoration Pulse review-ask dispatcher (RA-6952, epic RA-6948).
 *
 * One-shot, founder-voice email fired when a job transitions to CLOSED,
 * carrying the firm's Google review link. Follows the exact audited
 * mechanism studied from lib/pulse/dispatcher.ts (RA-6949): every dispatch
 * writes exactly one ClientCommsLog row — a SENT row when the email goes
 * out, or a SUPPRESSED row (with a machine-readable reason) when it does
 * not — reserved first via a unique idempotencyKey, so a P2002 collision on
 * the reservation is the "already dispatched" case. Never sends around this
 * log: a raw `sendPulseUpdateEmail` call without a prior reservation would
 * be able to double-send under a retried/concurrent close.
 *
 * Kept as a standalone module rather than folded into dispatchPulseNotification
 * because the trigger (job close, not a curated step/drying event), the
 * lookup (the firm's Organization via Workspace.owner, not just the client),
 * and the template are all distinct from the two events dispatcher.ts
 * already handles.
 *
 * Called synchronously (fire-and-forget) from the close-job hook
 * (app/api/inspections/[id]/close/route.ts) — so "within 24h of close" is
 * immediate by construction, there is no queue or delay in between.
 */

import { randomUUID } from "crypto";
import { resolveClientRecipient } from "@/lib/client-recipient";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";
import { sendPulseUpdateEmail } from "@/lib/email";
import { requireAddonForResource } from "@/lib/entitlements";
import { renderReviewAskEmail } from "./templates";
import {
  buildPulseOneClickUnsubscribeUrl,
  buildPulseUnsubscribeUrl,
} from "./pulse-unsubscribe-token";
import { isPulseOptedOutByAddress } from "./opt-out";

export type ReviewAskSuppressionReason =
  | "TOGGLE_OFF"
  | "OPT_OUT"
  | "NO_RECIPIENT"
  | "NO_URL"
  | "NOT_ENTITLED"
  | "MISSING_ENV"
  | "DUPLICATE"
  | "SEND_FAILED";

export type ReviewAskDispatchResult =
  | { status: "SENT"; logId: string }
  | {
      status: "SUPPRESSED";
      reason: ReviewAskSuppressionReason;
      logId: string;
    };

const CHANNEL_EMAIL = "EMAIL";
const EVENT_TYPE = "REVIEW_ASK";
const TEMPLATE_KEY = "pulse-review-ask";

import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";

/**
 * Hard dependency for a review-ask send. No portal dependency here (the email
 * links to the firm's external Google review page). The unsubscribe link's
 * secret and app URL are checked where that link is built.
 */
function reviewAskEnvConfigured(): boolean {
  return isEmailServiceConfigured();
}

/**
 * Dispatch the one-shot review-ask for a closed job. The idempotency key is
 * stable per job (`reviewask:<inspectionId>`, not per event state like the
 * dispatcher's fingerprinted keys) — a second close or re-close of the same
 * job can never send a second email.
 */
export async function dispatchReviewAskNotification(
  inspectionId: string,
): Promise<ReviewAskDispatchResult> {
  const job = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      inspectionNumber: true,
      pulseEnabled: true,
      report: {
        select: {
          client: {
            select: { id: true, email: true, pulseOptOut: true },
          },
        },
      },
      client: { select: { id: true, email: true, pulseOptOut: true } },
      workspace: {
        select: {
          name: true,
          owner: {
            select: {
              organization: {
                select: {
                  name: true,
                  tradingName: true,
                  googleReviewUrl: true,
                },
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

  const resolved = resolveClientRecipient({
    reportClient: job.report?.client,
    inspectionClient: job.client,
  });
  const client = resolved?.client ?? null;
  const recipient = resolved?.email ?? "";
  const org = job.workspace?.owner?.organization ?? null;
  const reviewUrl = org?.googleReviewUrl ?? "";
  const orgName =
    org?.tradingName || org?.name || job.workspace?.name || "Restore Assist";

  const logicalKey = `reviewask:${inspectionId}`;
  const base = {
    inspectionId,
    channel: CHANNEL_EMAIL,
    eventType: EVENT_TYPE,
    recipient,
    templateKey: TEMPLATE_KEY,
  };

  const suppress = async (
    reason: ReviewAskSuppressionReason,
  ): Promise<ReviewAskDispatchResult> => {
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
  if (job.report?.client?.pulseOptOut || job.client?.pulseOptOut) {
    return suppress("OPT_OUT");
  }
  if (!recipient || !client) return suppress("NO_RECIPIENT");
  if (await isPulseOptedOutByAddress(job.userId, recipient)) {
    return suppress("OPT_OUT");
  }
  if (!reviewUrl) return suppress("NO_URL");
  // RA-6954 — client-comms send requires the CLIENT_COMMS entitlement.
  // RA-7893: the CLIENT_COMMS of the business the JOB belongs to — not of an
  // organisation its creator joined after creating it.
  const addonGate = await requireAddonForResource(
    job.userId,
    job.createdAt,
    "CLIENT_COMMS",
  );
  if (!addonGate.allowed) return suppress("NOT_ENTITLED");
  // Fail closed with a row when the unsubscribe link cannot be built: an email
  // with no way out must not go, and a throw here would leave no record.
  let unsubscribeUrl: string | undefined;
  let oneClickUrl: string | undefined;
  try {
    unsubscribeUrl = buildPulseUnsubscribeUrl(client.id);
    oneClickUrl = buildPulseOneClickUnsubscribeUrl(client.id);
  } catch {
    unsubscribeUrl = undefined;
  }
  if (!reviewAskEnvConfigured() || !unsubscribeUrl) {
    reportError(
      new Error(
        "[pulse] Mailtrap or unsubscribe link env not configured — review-ask suppressed",
      ),
      { stage: "pulse:review-ask", inspectionId, connector: "mailtrap" },
    );
    return suppress("MISSING_ENV");
  }

  const rendered = renderReviewAskEmail(
    orgName,
    job.inspectionNumber,
    reviewUrl,
    unsubscribeUrl,
  );

  // Reserve the logical event atomically — mirrors dispatcher.ts. The unique
  // idempotencyKey guarantees at most one send per job, so a duplicate dispatch
  // (retried/concurrent close) cannot send a second email. PENDING until
  // Mailtrap accepts it, so a crash mid-send never reads as delivered.
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
    reportError(err, { stage: "pulse:review-ask:send", inspectionId });
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
  return { status: "SENT", logId: reservedId };
}
