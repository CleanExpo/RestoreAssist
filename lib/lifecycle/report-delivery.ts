import type { Prisma } from "@prisma/client";

/** A signed bearer link was generated. This is not evidence it was delivered. */
export const REPORT_INSURER_LINK_GENERATED_ACTION =
  "REPORT_INSURER_LINK_GENERATED" as const;

/** The report was emailed to the client and the provider accepted it (RA-7632). */
export const REPORT_SENT_ACTION = "REPORT_SENT" as const;

/** Existing audit actions that prove a report was actually sent or delivered. */
export const REPORT_DELIVERY_EVIDENCE_ACTIONS = [
  REPORT_SENT_ACTION,
  "REPORT_DELIVERED",
] as const;

export interface ReportSentInput {
  reportId: string;
  /** The job the report belongs to. Close Job looks the record up by it. */
  inspectionId: string;
  /** Who sent it. */
  userId: string;
  recipient: string;
  providerMessageId: string | null;
}

/**
 * RA-7632 — record that a report was emailed to the client.
 *
 * Call this only AFTER the email provider has accepted the message, and inside
 * a `prisma.$transaction` so the EmailAudit row and the AuditLog REPORT_SENT
 * row land together or not at all.
 *
 * The AuditLog keys (inspectionId, action, entityType "Report", entityId =
 * reportId) are exactly what `loadTransitionContext` queries for Close Job's
 * `report_sent` requirement; `lib/lifecycle/__tests__/report-sent-close.test.ts`
 * feeds this writer's rows into that reader to keep the two in step. The signed
 * link token is never written here.
 */
export async function recordReportSent(
  tx: Prisma.TransactionClient,
  input: ReportSentInput,
): Promise<{ emailAuditId: string; auditLogId: string }> {
  const emailAudit = await tx.emailAudit.create({
    data: {
      userId: input.userId,
      reportId: input.reportId,
      recipient: input.recipient,
      success: true,
      deliveryType: "immediate",
    },
    select: { id: true },
  });

  const auditLog = await tx.auditLog.create({
    data: {
      inspectionId: input.inspectionId,
      userId: input.userId,
      action: REPORT_SENT_ACTION,
      entityType: "Report",
      entityId: input.reportId,
      changes: JSON.stringify({
        channel: "email",
        audience: "client",
        deliveryStatus: "sent",
        emailAuditId: emailAudit.id,
        providerMessageId: input.providerMessageId,
      }),
    },
    select: { id: true },
  });

  return { emailAuditId: emailAudit.id, auditLogId: auditLog.id };
}
