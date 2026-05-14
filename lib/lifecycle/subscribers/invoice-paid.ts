/**
 * Punch-list P1 #21 — invoice-paid subscriber.
 *
 * Fires after the Stripe webhook (`payment_intent.succeeded`) sets
 * `Invoice.status = PAID`. The subscriber's job is to **observe** that
 * transition and surface it to the tradie:
 *
 *   1. Resolve Invoice → Report → Inspection (Invoice has no direct
 *      inspectionId column; the join goes via Report which carries
 *      `Inspection?` as a reverse 1-1 relation through
 *      `Inspection.reportId @unique`).
 *   2. Write a `Notification` row for the inspection's owner (the
 *      tradie / technician on `Inspection.userId`).
 *   3. Append an `AuditLog` row with action `INVOICE_PAID_OBSERVED`.
 *
 * Deliberately does **NOT** advance `Inspection.status`. SP-A §5.3
 * editability invariant: "every output lands in a confirmation surface;
 * the user always confirms before commit." The webhook can confirm a
 * payment cleared, but only the tradie can press "Close Job". The
 * subscriber's contract with the inspection state machine is purely
 * informational — it surfaces the trigger, the human pulls it.
 *
 * Idempotency anchor: an `AuditLog` with `action = INVOICE_PAID_OBSERVED`
 * and `entityType = "Invoice"` + `entityId = invoiceId`. If one exists,
 * the subscriber is a no-op. Stripe retries are real; this protects against
 * double-notification when an event is replayed.
 *
 * Fire-and-forget per CLAUDE.md rule #13 — caller wraps in
 * `void onInvoicePaid(...).catch(...)`. The function never throws on
 * expected branches (missing invoice, orphan, already-observed); it returns
 * a result object for tests and observability.
 */

import { prisma } from "@/lib/prisma";

export type InvoicePaidResult =
  | { ok: true; notified: true }
  | { ok: true; notified: false; reason: "already_observed" | "no_inspection_linked" }
  | { ok: false; reason: "invoice_not_found" | "internal_error" };

export async function onInvoicePaid(invoiceId: string): Promise<InvoicePaidResult> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        report: {
          select: {
            inspection: {
              select: { id: true, userId: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      console.warn("[invoice-paid] invoice not found", { invoiceId });
      return { ok: false, reason: "invoice_not_found" };
    }

    const inspection = invoice.report?.inspection ?? null;

    if (!inspection) {
      console.warn("[invoice-paid] paid invoice has no linked inspection", {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
      });
      return { ok: true, notified: false, reason: "no_inspection_linked" };
    }

    // Idempotency — bail if we've already observed this invoice's payment.
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: "INVOICE_PAID_OBSERVED",
        entityType: "Invoice",
        entityId: invoiceId,
      },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, notified: false, reason: "already_observed" };
    }

    await prisma.notification.create({
      data: {
        userId: inspection.userId,
        title: "Invoice paid",
        message: `Invoice ${invoice.invoiceNumber} has been paid. You can now close this job.`,
        type: "SUCCESS",
        link: `/dashboard/inspections/${inspection.id}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        inspectionId: inspection.id,
        action: "INVOICE_PAID_OBSERVED",
        entityType: "Invoice",
        entityId: invoiceId,
        userId: inspection.userId,
        changes: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          notifiedUserId: inspection.userId,
        }),
      },
    });

    return { ok: true, notified: true };
  } catch (err) {
    console.error("[invoice-paid] subscriber failed", {
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "internal_error" };
  }
}
