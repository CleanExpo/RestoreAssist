import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDraft, isCancelled } from "@/lib/invoice-status";
import { recordMutationAudit } from "@/lib/audit-log";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
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
            allocations: {
              select: {
                id: true,
                allocatedAmount: true,
                paymentId: true,
                invoiceId: true,
                createdAt: true,
              },
            },
          },
        },
        paymentAllocations: {
          select: {
            id: true,
            allocatedAmount: true,
            paymentId: true,
            invoiceId: true,
            createdAt: true,
          },
        },
        creditNotes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            creditNoteNumber: true,
            status: true,
            creditDate: true,
            appliedDate: true,
            subtotalExGST: true,
            gstAmount: true,
            totalIncGST: true,
            reason: true,
            reasonNotes: true,
            refundMethod: true,
            refundReference: true,
            refundedAt: true,
            invoiceId: true,
            userId: true,
            pdfUrl: true,
            pdfGeneratedAt: true,
            createdAt: true,
            updatedAt: true,
            lineItems: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                description: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
                gstRate: true,
                gstAmount: true,
                total: true,
                sortOrder: true,
                creditNoteId: true,
                createdAt: true,
              },
            },
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            action: true,
            description: true,
            metadata: true,
            userId: true,
            invoiceId: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        emails: {
          orderBy: { sentAt: "desc" },
          select: {
            id: true,
            emailType: true,
            recipientEmail: true,
            subject: true,
            sentAt: true,
            deliveredAt: true,
            openedAt: true,
            clickedAt: true,
            bouncedAt: true,
            resendEmailId: true,
            invoiceId: true,
          },
        },
        reminders: {
          orderBy: { scheduledFor: "desc" },
          select: {
            id: true,
            reminderType: true,
            scheduledFor: true,
            sentAt: true,
            status: true,
            invoiceId: true,
            createdAt: true,
          },
        },
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
        report: {
          select: { id: true, title: true, clientName: true },
        },
        estimate: {
          select: { id: true, totalIncGST: true },
        },
      },
    });

    if (!invoice) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    return fromException(request, error, { stage: "invoice-get" });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Check if invoice exists and belongs to user
    const existing = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    // Only allow updates to DRAFT invoices
    if (!isDraft(existing.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Only draft invoices can be edited",
        status: 409,
      });
    }

    const body = await request.json();
    const {
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerABN,
      invoiceDate,
      dueDate,
      lineItems,
      notes,
      terms,
      footer,
      discountAmount,
      discountPercentage,
      shippingAmount,
    } = body;

    // If line items are provided, recalculate financials
    let updateData: any = {
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerABN,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      terms,
      footer,
      discountAmount,
      discountPercentage,
      shippingAmount,
    };

    if (lineItems && lineItems.length > 0) {
      let subtotalExGST = 0;
      let gstAmount = 0;

      const processedLineItems = lineItems.map((item: any, index: number) => {
        const quantity = parseFloat(item.quantity);
        const unitPrice = parseInt(item.unitPrice);
        const subtotal = Math.round(quantity * unitPrice);
        const gstRate = item.gstRate ?? 10.0;
        const itemGst = Math.round(subtotal * (gstRate / 100));
        const total = subtotal + itemGst;

        subtotalExGST += subtotal;
        gstAmount += itemGst;

        return {
          description: item.description,
          category: item.category,
          quantity,
          unitPrice,
          subtotal,
          gstRate,
          gstAmount: itemGst,
          total,
          sortOrder: index,
          estimateLineItemId: item.estimateLineItemId,
        };
      });

      // Apply discounts
      if (discountAmount) {
        subtotalExGST -= discountAmount;
        gstAmount = Math.round(subtotalExGST * 0.1);
      } else if (discountPercentage) {
        const discount = Math.round(subtotalExGST * (discountPercentage / 100));
        subtotalExGST -= discount;
        gstAmount = Math.round(subtotalExGST * 0.1);
      }

      // Add shipping
      if (shippingAmount) {
        subtotalExGST += shippingAmount;
        gstAmount += Math.round(shippingAmount * 0.1);
      }

      const totalIncGST = subtotalExGST + gstAmount;

      updateData = {
        ...updateData,
        subtotalExGST,
        gstAmount,
        totalIncGST,
        amountDue: totalIncGST,
      };

      // Update invoice with line items in transaction
      const invoice = await prisma.$transaction(async (tx) => {
        // Delete existing line items
        await tx.invoiceLineItem.deleteMany({
          where: { invoiceId: id, invoice: { userId: session.user.id } },
        });

        // Update invoice and create new line items
        const updated = await tx.invoice.update({
          where: { id, userId: session.user.id },
          data: {
            ...updateData,
            lineItems: {
              create: processedLineItems,
            },
          },
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
          },
        });

        // Create audit log
        await tx.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: session.user.id,
            action: "updated",
            description: `Invoice ${existing.invoiceNumber} updated`,
          },
        });

        return updated;
      });

      await recordMutationAudit({
        resource: "invoice",
        resourceId: id,
        verb: "UPDATE",
        action: "invoice.update",
        actorUserId: session.user.id,
        metadata: {
          invoiceNumber: existing.invoiceNumber,
          linesReplaced: true,
          lineCount: lineItems.length,
        },
        request,
      });
      return NextResponse.json({ invoice });
    } else {
      // Update invoice without line items
      const invoice = await prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.update({
          where: { id },
          data: updateData,
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
          },
        });

        // Create audit log
        await tx.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: session.user.id,
            action: "updated",
            description: `Invoice ${existing.invoiceNumber} updated`,
          },
        });

        return updated;
      });

      await recordMutationAudit({
        resource: "invoice",
        resourceId: id,
        verb: "UPDATE",
        action: "invoice.update",
        actorUserId: session.user.id,
        metadata: {
          invoiceNumber: existing.invoiceNumber,
          linesReplaced: false,
        },
        request,
      });
      return NextResponse.json({ invoice });
    }
  } catch (error: any) {
    return fromException(request, error, { stage: "invoice-put" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Check if invoice exists and belongs to user
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!invoice) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    // Only allow deletion of DRAFT or CANCELLED invoices
    if (!isDraft(invoice.status) && !isCancelled(invoice.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Only draft or cancelled invoices can be deleted",
        status: 409,
      });
    }

    // Delete invoice (cascade will handle related records)
    await prisma.invoice.delete({
      where: { id },
    });

    await recordMutationAudit({
      resource: "invoice",
      resourceId: id,
      verb: "DELETE",
      action: "invoice.delete",
      actorUserId: session.user.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error: any) {
    return fromException(request, error, { stage: "invoice-delete" });
  }
}
