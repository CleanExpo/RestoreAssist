import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

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
        select: { id: true },
      });

      if (!invoice) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }

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
        gstRate: number;
      }> = Array.isArray(lineItems) ? lineItems : [];

      const subtotalExGST = items.reduce(
        (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
        0,
      );
      const gstAmount = items.reduce(
        (sum, item) =>
          sum +
          Math.round(item.quantity * item.unitPrice * (item.gstRate / 100)),
        0,
      );
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
            create: items.map((item, idx) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: Math.round(item.unitPrice),
              gstRate: item.gstRate ?? 10,
              subtotal: Math.round(item.quantity * item.unitPrice),
              gstAmount: Math.round(
                item.quantity * item.unitPrice * (item.gstRate / 100),
              ),
              total: Math.round(
                item.quantity * item.unitPrice * (1 + item.gstRate / 100),
              ),
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
