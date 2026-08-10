/**
 * SP-A Task 7 — Hydrate a TransitionContext for the inspection state machine.
 *
 * Extracted from the close route so SP-B's webhook subscribers
 * (lib/lifecycle/subscribers/*) can reuse the same hydration logic without
 * round-tripping through HTTP.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 7 step 3.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { TransitionContext } from "./inspection-state-machine";
import { REPORT_DELIVERY_EVIDENCE_ACTIONS } from "./report-delivery";

/**
 * Pulls the minimal data needed to evaluate canTransition for the given
 * inspection: latest invoice status and reconciliation state, report status,
 * genuine report sent/delivered event, and handover timestamp.
 *
 * Accepts a `PrismaClient` or `Prisma.TransactionClient` so it composes
 * with the close route's `$transaction` boundary.
 */
export async function loadTransitionContext(
  db: PrismaClient | Prisma.TransactionClient,
  inspectionId: string,
): Promise<TransitionContext> {
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      handoverCompletedAt: true,
      reportId: true,
      report: { select: { status: true } },
    },
  });

  // Invoice lookup is by inspection's report. Fall back to null if no
  // invoice/report yet — the state machine will treat null as "not paid".
  let invoiceStatus: TransitionContext["invoiceStatus"] = null;
  let invoiceHasUnreconciledPayment = false;
  let reportDeliveredAt: Date | null = null;
  if (inspection?.reportId) {
    const [invoice, delivery] = await Promise.all([
      db.invoice.findFirst({
        where: {
          reportId: inspection.reportId,
          source: `inspection:${inspectionId}`,
        },
        orderBy: { invoiceDate: "desc" },
        select: { id: true, status: true },
      }),
      db.auditLog.findFirst({
        where: {
          inspectionId,
          action: { in: [...REPORT_DELIVERY_EVIDENCE_ACTIONS] },
          entityType: "Report",
          entityId: inspection.reportId,
        },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
    ]);
    if (invoice) {
      invoiceStatus = invoice.status as TransitionContext["invoiceStatus"];
      const unreconciledPayment = await db.invoicePayment.findFirst({
        where: { invoiceId: invoice.id, reconciled: false },
        select: { id: true },
      });
      invoiceHasUnreconciledPayment = Boolean(unreconciledPayment);
    }
    reportDeliveredAt = delivery?.timestamp ?? null;
  }

  return {
    invoiceStatus,
    invoiceHasUnreconciledPayment,
    reportStatus:
      (inspection?.report?.status as TransitionContext["reportStatus"]) ?? null,
    reportDeliveredAt,
    handoverCompletedAt: inspection?.handoverCompletedAt ?? null,
  };
}
