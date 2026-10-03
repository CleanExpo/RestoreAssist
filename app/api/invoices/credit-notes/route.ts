import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import {
  getGstTreatmentForCurrency,
  resolveLineGstRatePercent,
} from "@/lib/gst-rules";
import { lineAmountsCents } from "@/lib/invoices/calc";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const creditNotes = await prisma.creditNote.findMany({
      where: { userId: session.user.id },
      include: {
        invoice: {
          select: { invoiceNumber: true, customerName: true },
        },
        lineItems: {
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
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ creditNotes });
  } catch (error) {
    return fromException(request, error, { stage: "list-credit-notes" });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: Idempotency-Key guard prevents duplicate credit-note issuance
  // when a client retries a POST it never saw a response for.
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
      const {
        invoiceId,
        reason,
        reasonNotes,
        creditDate,
        lineItems,
        refundMethod,
        refundReference,
      } = body;

      if (!invoiceId || !reason) {
        return apiError(request, {
          code: "VALIDATION",
          message: "invoiceId and reason are required",
          status: 422,
        });
      }

      // Verify the invoice belongs to this user
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, userId },
        select: { id: true, currency: true },
      });

      if (!invoice) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }
      const gstTreatment = getGstTreatmentForCurrency(invoice.currency);

      // Generate credit note number
      const count = await prisma.creditNote.count({
        where: { userId },
      });
      const year = new Date().getFullYear();
      const creditNoteNumber = `CN-${year}-${String(count + 1).padStart(4, "0")}`;

      // Calculate totals from line items
      const items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        gstRate?: number;
      }> = Array.isArray(lineItems) ? lineItems : [];

      const invalidGstIndex = items.findIndex((item) => {
        if (item.gstRate === null || item.gstRate === undefined) return false;
        const rate = Number(item.gstRate);
        return !Number.isFinite(rate) || rate < 0;
      });
      if (invalidGstIndex >= 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Line item ${invalidGstIndex + 1} has an invalid GST rate`,
          status: 400,
        });
      }

      // RA-7705: the invoice rule — each line rounded to cents in decimal,
      // GST on the rounded line, header = sum of the lines.
      const lines = items.map((item) => {
        const unitPrice = Math.round(Number(item.unitPrice));
        const gstRate = resolveLineGstRatePercent(item.gstRate, gstTreatment);
        return {
          item,
          unitPrice,
          gstRate,
          ...lineAmountsCents(Number(item.quantity), unitPrice, gstRate),
        };
      });
      const subtotalExGST = lines.reduce((sum, l) => sum + l.subtotal, 0);
      const gstAmount = lines.reduce((sum, l) => sum + l.gstAmount, 0);
      const totalIncGST = subtotalExGST + gstAmount;

      const creditNote = await prisma.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId,
          userId,
          reason,
          reasonNotes: reasonNotes || null,
          creditDate: creditDate ? new Date(creditDate) : new Date(),
          subtotalExGST,
          gstAmount,
          totalIncGST,
          refundMethod: refundMethod || null,
          refundReference: refundReference || null,
          status: "DRAFT",
          lineItems: {
            create: lines.map((l, idx) => ({
              description: l.item.description,
              quantity: l.item.quantity,
              unitPrice: l.unitPrice,
              gstRate: l.gstRate,
              subtotal: l.subtotal,
              gstAmount: l.gstAmount,
              total: l.total,
              sortOrder: idx,
            })),
          },
        },
        include: {
          lineItems: {
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
      });

      return NextResponse.json({ creditNote }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "create-credit-note" });
    }
  });
}
