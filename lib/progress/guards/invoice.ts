/**
 * Invoice / close-out guards.
 *
 * Board evidence contract (00-board-minutes.md §5.2):
 *
 *  DRYING_CERTIFIED → CLOSEOUT (initiate_closeout)
 *    - No open ScopeVariation in PENDING
 *    - No open HIGH/CRITICAL WHSIncident
 *
 *  CLOSEOUT → INVOICE_ISSUED (issue_invoice)
 *    - An Invoice exists for the Report with status=SENT
 *    - Invoice.totalIncGST > 0
 *    - GST consistent (subtotal + gst = totalIncGST, tolerance ±1 cent)
 *
 *  INVOICE_ISSUED → INVOICE_PAID (record_payment)
 *    - Invoice.status = PAID OR Invoice.amountDue = 0
 *    - At least one InvoicePayment row
 *
 *  CLOSEOUT → DRYING_ACTIVE (reopen_drying)
 *  No DB gate — admin-only transition enforced by permissions.
 */

import type { PrismaClient } from "@prisma/client";
import type { GuardFn } from "./types";

type Db = Pick<
  PrismaClient,
  "scopeVariation" | "wHSIncident" | "invoice" | "invoicePayment"
>;

export const initiateCloseoutGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "initiate_closeout requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;

  const [pendingVariations, openWhs] = await Promise.all([
    prisma.scopeVariation.findMany({
      where: { inspectionId: ctx.inspectionId, status: "PENDING" },
      select: { id: true },
    }),
    prisma.wHSIncident.findMany({
      where: {
        inspectionId: ctx.inspectionId,
        severity: { in: ["HIGH", "CRITICAL"] },
        status: "OPEN",
      },
      select: { id: true, severity: true },
    }),
  ]);

  if (pendingVariations.length > 0) {
    return {
      passed: false,
      reason: `${pendingVariations.length} PENDING ScopeVariation(s) must be resolved before closeout`,
      snapshot: { pendingVariations },
    };
  }
  if (openWhs.length > 0) {
    return {
      passed: false,
      reason: `${openWhs.length} open HIGH/CRITICAL WHSIncident(s) must be resolved before closeout`,
      snapshot: { openWhs },
    };
  }

  return {
    passed: true,
    snapshot: { pendingVariations: 0, openWhs: 0 },
  };
};

export const issueInvoiceGuard: GuardFn = async (db, ctx) => {
  const prisma = db as Db;

  const invoice = await prisma.invoice.findFirst({
    where: { reportId: ctx.reportId, status: "SENT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      subtotalExGST: true,
      gstAmount: true,
      totalIncGST: true,
    },
  });

  if (!invoice) {
    return {
      passed: false,
      reason: "No Invoice with status=SENT for this report",
      snapshot: {},
    };
  }

  const total = Number(invoice.totalIncGST);
  const sub = Number(invoice.subtotalExGST);
  const gst = Number(invoice.gstAmount);

  if (!Number.isFinite(total) || total <= 0) {
    return {
      passed: false,
      reason: "Invoice totalIncGST must be > 0",
      snapshot: { invoiceId: invoice.id, totalIncGST: total },
    };
  }
  // Accounting paper — tolerance ±1 cent for rounding
  if (Math.abs(sub + gst - total) > 0.01) {
    return {
      passed: false,
      reason: `Invoice totals inconsistent: subtotal(${sub}) + gst(${gst}) != total(${total})`,
      snapshot: {
        invoiceId: invoice.id,
        subtotalExGST: sub,
        gstAmount: gst,
        totalIncGST: total,
      },
    };
  }

  return {
    passed: true,
    snapshot: {
      invoiceId: invoice.id,
      totalIncGST: total,
      subtotalExGST: sub,
      gstAmount: gst,
    },
  };
};

export const recordPaymentGuard: GuardFn = async (db, ctx) => {
  const prisma = db as Db;

  const invoice = await prisma.invoice.findFirst({
    where: { reportId: ctx.reportId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, amountDue: true, totalIncGST: true },
  });
  if (!invoice) {
    return {
      passed: false,
      reason: "No Invoice for this report",
      snapshot: {},
    };
  }

  const paymentCount = await prisma.invoicePayment.count({
    where: { invoiceId: invoice.id },
  });

  const amountDue = Number(invoice.amountDue ?? 0);
  const paid =
    invoice.status === "PAID" ||
    (Number.isFinite(amountDue) && amountDue <= 0.01);

  if (!paid) {
    return {
      passed: false,
      reason: `Invoice ${invoice.id} not settled (status=${invoice.status}, amountDue=${amountDue})`,
      snapshot: { invoiceId: invoice.id, status: invoice.status, amountDue },
    };
  }
  if (paymentCount === 0) {
    return {
      passed: false,
      reason:
        "No InvoicePayment row — payment must be recorded against the invoice",
      snapshot: { invoiceId: invoice.id },
    };
  }

  return {
    passed: true,
    snapshot: {
      invoiceId: invoice.id,
      status: invoice.status,
      amountDue,
      paymentCount,
    },
  };
};
