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
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";
import { sendPulseUpdateEmail } from "@/lib/email";
import { renderReviewAskEmail } from "./templates";

export type ReviewAskSuppressionReason =
  | "TOGGLE_OFF"
  | "OPT_OUT"
  | "NO_RECIPIENT"
  | "NO_URL"
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

/**
 * Hard dependency for a review-ask send. No portal/app-url dependency here
 * (the email links to the firm's external Google review page, not the
 * portal) — only the Resend connector itself needs to be configured.
 */
function reviewAskEnvConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
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
      inspectionNumber: true,
      pulseEnabled: true,
      report: {
        select: {
          client: {
            select: { email: true, pulseOptOut: true },
          },
        },
      },
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

  const client = job.report?.client ?? null;
  const recipient = client?.email ?? "";
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
  if (client?.pulseOptOut) return suppress("OPT_OUT");
  if (!recipient) return suppress("NO_RECIPIENT");
  if (!reviewUrl) return suppress("NO_URL");
  if (!reviewAskEnvConfigured()) {
    reportError(
      new Error(
        "[pulse] Resend env not configured — review-ask suppressed",
      ),
      { stage: "pulse:review-ask", inspectionId, connector: "resend" },
    );
    return suppress("MISSING_ENV");
  }

  // Reserve the logical event atomically — mirrors dispatcher.ts. The unique
  // idempotencyKey guarantees at most one SENT row per job, so a duplicate
  // dispatch (retried/concurrent close) cannot send a second email.
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

  const rendered = renderReviewAskEmail(
    orgName,
    job.inspectionNumber,
    reviewUrl,
  );

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
    return { status: "SENT", logId: reservedId };
  } catch (err) {
    reportError(err, { stage: "pulse:review-ask:send", inspectionId });
    await prisma.clientCommsLog.update({
      where: { id: reservedId },
      data: { status: "SUPPRESSED", suppressionReason: "SEND_FAILED" },
    });
    return { status: "SUPPRESSED", reason: "SEND_FAILED", logId: reservedId };
  }
}
