import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDraft, isCancelled } from "@/lib/invoice-status";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { requireAddon } from "@/lib/entitlements";
import { PAYMENTS_SKU } from "@/lib/billing/payments-addon";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

function paymentConflict(): Error & { code: "P2034" } {
  return Object.assign(new Error("Invoice payment state changed"), {
    code: "P2034" as const,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-6920 B4: manual/bank-deposit payment recording is gated by the
  // recurring $11/mo PAYMENTS add-on. requireAddon returns a fail-closed 402
  // (code ADDON_REQUIRED) when the workspace has no ACTIVE FeatureEntitlement.
  // Existing workspaces that already recorded a manual payment before this
  // gate shipped are grandfathered by scripts/grandfather-payments-addon.ts
  // (run in the same deploy window as this PR) so they are not locked out.
  const addonGate = await requireAddon(userId, PAYMENTS_SKU);
  if (!addonGate.allowed) return addonGate.response;

  const { id } = await params;

  // RA-1266: wrap the mutation with Idempotency-Key so a retried POST
  // doesn't double-record a payment. Opt-in — clients without the
  // header behave as before.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { amount, paymentMethod, reference, notes, paymentDate } = body;

      if (!Number.isInteger(amount) || amount <= 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Valid payment amount is required",
          status: 400,
        });
      }

      if (!paymentMethod) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Payment method is required",
          status: 400,
        });
      }

      let result:
        | { kind: "recorded"; payment: unknown; invoice: unknown }
        | { kind: "not-found" }
        | { kind: "invalid-status" }
        | { kind: "invalid-balance" }
        | { kind: "over-allocation" }
        | undefined;

      for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
        try {
          result = await prisma.$transaction(
            async (tx) => {
              const invoice = await tx.invoice.findUnique({
                where: { id, userId },
                select: {
                  id: true,
                  userId: true,
                  status: true,
                  currency: true,
                  totalIncGST: true,
                  amountPaid: true,
                  amountDue: true,
                  paidDate: true,
                },
              });

              if (!invoice) return { kind: "not-found" as const };
              if (isDraft(invoice.status) || isCancelled(invoice.status)) {
                return { kind: "invalid-status" as const };
              }
              if (
                invoice.amountPaid < 0 ||
                invoice.amountDue < 0 ||
                invoice.amountPaid + invoice.amountDue !== invoice.totalIncGST
              ) {
                return { kind: "invalid-balance" as const };
              }
              if (amount > invoice.amountDue) {
                return { kind: "over-allocation" as const };
              }

              const newAmountPaid = invoice.amountPaid + amount;
              const newAmountDue = invoice.amountDue - amount;
              const newStatus = newAmountDue === 0 ? "PAID" : "PARTIALLY_PAID";
              const paidAt = newAmountDue === 0 ? new Date() : invoice.paidDate;

              // Compare-and-set the exact financial snapshot read above. A
              // concurrent payment changes either amount field, making this
              // write lose and forcing a serializable retry with fresh values.
              const updated = await tx.invoice.updateMany({
                where: {
                  id,
                  userId,
                  amountPaid: invoice.amountPaid,
                  amountDue: invoice.amountDue,
                },
                data: {
                  amountPaid: newAmountPaid,
                  amountDue: newAmountDue,
                  status: newStatus,
                  paidDate: paidAt,
                },
              });
              if (updated.count === 0) throw paymentConflict();

              const payment = await tx.invoicePayment.create({
                data: {
                  amount,
                  currency: invoice.currency,
                  paymentMethod,
                  reference,
                  notes,
                  paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                  invoiceId: id,
                  userId,
                  reconciled: false,
                },
              });

              await tx.invoicePaymentAllocation.create({
                data: {
                  paymentId: payment.id,
                  invoiceId: id,
                  allocatedAmount: amount,
                },
              });

              await tx.invoiceAuditLog.create({
                data: {
                  invoiceId: id,
                  userId,
                  action: "payment_received",
                  description: `Payment of $${(amount / 100).toFixed(2)} received via ${paymentMethod}`,
                  metadata: {
                    paymentId: payment.id,
                    amount,
                    currency: invoice.currency,
                    paymentMethod,
                    reference,
                  },
                },
              });

              const updatedInvoice = await tx.invoice.findUnique({
                where: { id, userId },
                include: {
                  lineItems: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      description: true,
                      category: true,
                      quantity: true,
                      unitPrice: true,
                      xeroAccountCode: true,
                      subtotal: true,
                      gstRate: true,
                      gstAmount: true,
                      total: true,
                      discountAmount: true,
                      sortOrder: true,
                      invoiceId: true,
                      estimateLineItemId: true,
                      createdAt: true,
                    },
                  },
                  payments: {
                    orderBy: { paymentDate: "desc" },
                    select: {
                      id: true,
                      amount: true,
                      currency: true,
                      paymentMethod: true,
                      paymentDate: true,
                      reference: true,
                      notes: true,
                      stripePaymentIntentId: true,
                      stripeChargeId: true,
                      externalPaymentId: true,
                      externalProvider: true,
                      webhookEventId: true,
                      reconciled: true,
                      reconciledAt: true,
                      reconciledBy: true,
                      invoiceId: true,
                      userId: true,
                      createdAt: true,
                      updatedAt: true,
                    },
                  },
                },
              });

              return {
                kind: "recorded" as const,
                payment,
                invoice: updatedInvoice,
              };
            },
            { isolationLevel: "Serializable" },
          );
          break;
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === "P2034") {
            if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
            break;
          }
          throw error;
        }
      }

      if (!result) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Invoice payment state changed; retry the payment",
          status: 409,
        });
      }
      if (result.kind === "not-found") {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }
      if (result.kind === "invalid-status") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Cannot record payment for draft or cancelled invoices",
          status: 400,
        });
      }
      if (result.kind === "invalid-balance") {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Invoice balance is inconsistent; reconcile it before recording payment",
          status: 409,
        });
      }
      if (result.kind === "over-allocation") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Payment amount exceeds amount due",
          status: 400,
        });
      }

      return NextResponse.json(
        {
          payment: result.payment,
          invoice: result.invoice,
          message: "Payment recorded successfully",
        },
        { status: 201 },
      );
    } catch (error: any) {
      console.error("Error recording payment:", error);
      return fromException(request, error, { stage: "record-payment" });
    }
  });
}
