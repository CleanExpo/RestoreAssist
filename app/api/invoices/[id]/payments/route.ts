import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDraft, isCancelled } from "@/lib/invoice-status";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: wrap the mutation with Idempotency-Key so a retried POST
  // doesn't double-record a payment. Opt-in — clients without the
  // header behave as before.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id, userId },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 },
        );
      }

      if (isDraft(invoice.status) || isCancelled(invoice.status)) {
        return NextResponse.json(
          { error: "Cannot record payment for draft or cancelled invoices" },
          { status: 400 },
        );
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const { amount, paymentMethod, reference, notes, paymentDate } = body;

      if (!amount || amount <= 0) {
        return NextResponse.json(
          { error: "Valid payment amount is required" },
          { status: 400 },
        );
      }

      if (!paymentMethod) {
        return NextResponse.json(
          { error: "Payment method is required" },
          { status: 400 },
        );
      }

      if (amount > invoice.amountDue) {
        return NextResponse.json(
          { error: "Payment amount exceeds amount due" },
          { status: 400 },
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.invoicePayment.create({
          data: {
            amount,
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

        const newAmountPaid = invoice.amountPaid + amount;
        const newAmountDue = invoice.totalIncGST - newAmountPaid;

        let newStatus = invoice.status;
        if (newAmountDue === 0) {
          newStatus = "PAID";
        } else if (newAmountPaid > 0 && newAmountDue > 0) {
          newStatus = "PARTIALLY_PAID";
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id },
          data: {
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            status: newStatus,
            paidDate: newAmountDue === 0 ? new Date() : invoice.paidDate,
          },
          include: {
            lineItems: { orderBy: { sortOrder: "asc" } },
            payments: { orderBy: { paymentDate: "desc" } },
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
              paymentMethod,
              reference,
            },
          },
        });

        return { payment, invoice: updatedInvoice };
      });

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
      return NextResponse.json(
        { error: "Failed to record payment" },
        { status: 500 },
      );
    }
  });
}
