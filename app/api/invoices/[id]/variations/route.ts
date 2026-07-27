import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals } from "@/lib/invoices/calc";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/invoices/[id]/variations - Get invoice variations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Get original invoice
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

    // Get all variations of this invoice
    const variationsInclude = {
      lineItems: {
        orderBy: { sortOrder: "asc" } as const,
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
    };

    const variations = await prisma.invoice.findMany({
      where: {
        originalInvoiceId: id,
        userId: session.user.id,
      },
      include: variationsInclude,
      orderBy: {
        createdAt: "asc",
      },
      take: 200,
    });

    // If this invoice is itself a variation, get the original and all siblings
    let original = null;
    let allVariations = variations;

    if (invoice.originalInvoiceId) {
      original = await prisma.invoice.findUnique({
        where: {
          id: invoice.originalInvoiceId,
        },
        include: variationsInclude,
      });

      // Get all variations of the original
      allVariations = await prisma.invoice.findMany({
        where: {
          originalInvoiceId: invoice.originalInvoiceId,
          userId: session.user.id,
        },
        include: variationsInclude,
        orderBy: {
          createdAt: "asc",
        },
        take: 200,
      });
    }

    return NextResponse.json({
      original: original || (invoice.originalInvoiceId ? null : invoice),
      variations: allVariations,
    });
  } catch (error) {
    console.error("Error fetching invoice variations:", error);
    return fromException(request, error, { stage: "list-variations" });
  }
}

// POST /api/invoices/[id]/variations - Create invoice variation (change order)
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
  const { id } = await params;

  // RA-1266: Idempotency-Key prevents duplicate variation orders — a
  // double-submit would create two variation invoices against the same
  // base, each issued to the customer.
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
        notes,
        lineItems,
        discountAmount,
        discountPercentage,
        shippingAmount,
        terms,
      } = body;

      // Get original invoice. Only parent scalars are read downstream;
      // lineItems are minimally selected (id only) — kept in case future
      // logic decides to clone or diff them.
      const originalInvoice = await prisma.invoice.findUnique({
        where: {
          id,
          userId: userId,
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          },
        },
      });

      if (!originalInvoice) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }

      // If the original invoice is itself a variation, use its original
      const baseInvoiceId = originalInvoice.originalInvoiceId || id;

      // RA-7096 — use the existing single source of truth (lib/invoices/calc.ts).
      // This block previously summed per-line GST and then discarded it with
      // `gst = Math.round(subtotal * 0.1)`, taxing GST-free lines at 10% on a
      // tax invoice. calc.ts already implements the server algorithm including
      // proportional discount scaling and GST on shipping.
      const totals = calculateInvoiceTotals({
        lineItems: lineItems.map((item: any) => ({
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          gstRate: item.gstRate,
        })),
        discountAmount: discountAmount ? parseFloat(discountAmount) * 100 : null,
        discountPercentage: discountPercentage
          ? parseFloat(discountPercentage)
          : null,
        shippingAmount: shippingAmount ? parseFloat(shippingAmount) * 100 : null,
      });
      const subtotal = totals.subtotalExGST;
      const gst = totals.gstAmount;
      const total = totals.totalIncGST;

      // RA-7097 — atomic, schema-correct sequence allocation.
      //
      // This previously read `(sequence as any).nextNumber`, a field that has
      // never existed on InvoiceSequence (schema has `lastNumber`), so the
      // route threw `TypeError: Cannot read properties of undefined` on every
      // call. The `as any` casts hid it from tsc. It also read-then-wrote
      // outside a transaction, so concurrent variations could mint the same
      // number. The upsert increment is atomic and mirrors
      // app/api/invoices/route.ts.
      const year = new Date().getFullYear();
      const sequence = await prisma.invoiceSequence.upsert({
        where: { userId_year: { userId, year } },
        update: { lastNumber: { increment: 1 } },
        create: { userId, year, prefix: "RA", lastNumber: 1 },
      });

      const invoiceNumber = `${sequence.prefix}-${year}-${String(
        sequence.lastNumber,
      ).padStart(4, "0")}-V`;

      // Calculate due date (default 30 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create variation invoice
      const variation = await (prisma.invoice.create as any)({
        data: {
          invoiceNumber,
          status: "DRAFT",
          invoiceDate: new Date(),
          dueDate,
          // Copy customer details from original
          customerName: originalInvoice.customerName,
          customerEmail: originalInvoice.customerEmail,
          customerPhone: originalInvoice.customerPhone,
          customerAddress: originalInvoice.customerAddress,
          customerABN: originalInvoice.customerABN,
          // Financial amounts
          subtotalExGST: subtotal,
          gstAmount: gst,
          totalIncGST: total,
          amountDue: total,
          // Additional charges
          discountAmount: discountAmount
            ? Math.round(parseFloat(discountAmount) * 100)
            : 0,
          discountPercentage: discountPercentage
            ? parseFloat(discountPercentage)
            : null,
          shippingAmount: shippingAmount
            ? Math.round(parseFloat(shippingAmount) * 100)
            : 0,
          // Content
          notes:
            notes || `Variation of invoice ${originalInvoice.invoiceNumber}`,
          terms: terms || originalInvoice.terms,
          footer: originalInvoice.footer,
          // Relationships
          originalInvoiceId: baseInvoiceId,
          reportId: originalInvoice.reportId,
          estimateId: originalInvoice.estimateId,
          clientId: originalInvoice.clientId,
          contactId: (originalInvoice as any).contactId,
          companyId: (originalInvoice as any).companyId,
          templateId: originalInvoice.templateId,
          userId: userId,
          // Line items
          lineItems: {
            create: lineItems.map((item: any, index: number) => ({
              description: item.description,
              category: item.category || null,
              quantity: item.quantity,
              unitPrice: Math.round(item.unitPrice * 100),
              subtotal: Math.round(item.quantity * item.unitPrice * 100),
              gstRate: item.gstRate ?? 10,
              gstAmount: Math.round(
                item.quantity * item.unitPrice * 100 * (item.gstRate / 100),
              ),
              total: Math.round(
                item.quantity * item.unitPrice * 100 * (1 + item.gstRate / 100),
              ),
              sortOrder: index,
            })),
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
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: variation.id,
          userId: userId,
          action: "variation_created",
          description: `Created variation from invoice ${originalInvoice.invoiceNumber}`,
          metadata: {
            originalInvoiceId: id,
            originalInvoiceNumber: originalInvoice.invoiceNumber,
          },
        },
      });

      // Create audit log on original invoice
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: id,
          userId: userId,
          action: "variation_created",
          description: `Variation ${variation.invoiceNumber} created`,
          metadata: {
            variationInvoiceId: variation.id,
            variationInvoiceNumber: variation.invoiceNumber,
          },
        },
      });

      return NextResponse.json({ variation }, { status: 201 });
    } catch (error) {
      console.error("Error creating invoice variation:", error);
      return fromException(request, error, { stage: "create-variation" });
    }
  });
}
