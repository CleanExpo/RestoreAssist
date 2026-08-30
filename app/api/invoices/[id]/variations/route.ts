import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals } from "@/lib/invoices/calc";
import { getGstTreatmentForCurrency } from "@/lib/gst-rules";
import {
  inheritGstRate,
  resolveLineGstRate,
} from "@/lib/invoices/inherit-gst-rate";
import { validateAdjustments } from "@/lib/invoices/validate-adjustments";
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

      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "At least one line item is required",
          status: 400,
        });
      }

      for (let index = 0; index < lineItems.length; index++) {
        const item = lineItems[index];
        const quantity = parseFloat(item.quantity);
        const unitPriceDollars = parseFloat(item.unitPrice);
        if (!Number.isFinite(quantity) || quantity < 0) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Line item ${index + 1} has an invalid quantity — must be a non-negative number`,
            status: 400,
          });
        }
        if (!Number.isFinite(unitPriceDollars)) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Line item ${index + 1} has an invalid unit price`,
            status: 400,
          });
        }
        // Allow omitted gstRate (resolved via parent inherit below). Explicit
        // 0 must remain valid — never coerce with `|| 10` (RA-7096).
        if (
          item.gstRate !== undefined &&
          item.gstRate !== null &&
          (!Number.isFinite(Number(item.gstRate)) || Number(item.gstRate) < 0)
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Line item ${index + 1} has an invalid GST rate`,
            status: 400,
          });
        }
        if (
          typeof item.description !== "string" ||
          !item.description.trim()
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Line item ${index + 1} requires a description`,
            status: 400,
          });
        }
      }

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
            select: { id: true, gstRate: true },
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

      // RA-7096 — when the client omits gstRate, inherit the parent's modal
      // rate so a GST-free parent does not mint a 10% variation by default.
      const inheritedGstRate = inheritGstRate(originalInvoice.lineItems);

      const lineItemsForCalc = lineItems.map((item: any) => ({
        quantity: item.quantity,
        unitPrice: Math.round(Number(item.unitPrice) * 100),
        gstRate: resolveLineGstRate(item.gstRate, inheritedGstRate),
      }));
      const discountAmountCents = discountAmount
        ? Math.round(parseFloat(discountAmount) * 100)
        : null;
      const shippingAmountCents = shippingAmount
        ? Math.round(parseFloat(shippingAmount) * 100)
        : null;
      const discountPercentageNum = discountPercentage
        ? parseFloat(discountPercentage)
        : null;

      // Pre-discount line subtotal for adjustment bounds (mirrors create route).
      const preDiscountSubtotal = lineItemsForCalc.reduce(
        (sum: number, item: { quantity: number; unitPrice: number }) =>
          sum + Math.round(Number(item.quantity) * Number(item.unitPrice)),
        0,
      );
      const adjustmentError = validateAdjustments(
        request,
        {
          discountAmount: discountAmountCents,
          discountPercentage: discountPercentageNum,
          shippingAmount: shippingAmountCents,
        },
        preDiscountSubtotal,
      );
      if (adjustmentError) return adjustmentError;

      // RA-7096 — use the existing single source of truth (lib/invoices/calc.ts).
      //
      // The rate comes from the parent invoice's own currency, not from the
      // tenant's current country: a variation belongs to an already-issued
      // document, and that document's jurisdiction is fixed at issue. A tenant
      // who moved AU -> NZ must not have last year's AUD invoice re-taxed at
      // 15%. Omitting this argument previously fell back to a hardcoded 10%,
      // which taxed shipping on every NZ variation at the Australian rate.
      const totals = calculateInvoiceTotals({
        lineItems: lineItemsForCalc,
        discountAmount: discountAmountCents,
        discountPercentage: discountPercentageNum,
        shippingAmount: shippingAmountCents,
        defaultGstRatePercent: getGstTreatmentForCurrency(
          originalInvoice.currency,
        ).ratePercent,
      });
      const subtotal = totals.subtotalExGST;
      const gst = totals.gstAmount;
      const total = totals.totalIncGST;

      // RA-7097 — sequence + create + audit logs in one transaction so a
      // mid-flight failure cannot leave an orphaned sequence number or a
      // variation without custody logs. Mirrors app/api/invoices/route.ts.
      const year = new Date().getFullYear();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const discountAmountPersisted = discountAmount
        ? Math.round(parseFloat(discountAmount) * 100)
        : 0;
      const discountPercentagePersisted = discountPercentage
        ? parseFloat(discountPercentage)
        : null;
      const shippingAmountPersisted = shippingAmount
        ? Math.round(parseFloat(shippingAmount) * 100)
        : 0;

      const variation = await prisma.$transaction(async (tx) => {
        const sequence = await tx.invoiceSequence.upsert({
          where: { userId_year: { userId, year } },
          update: { lastNumber: { increment: 1 } },
          create: { userId, year, prefix: "RA", lastNumber: 1 },
        });

        const invoiceNumber = `${sequence.prefix}-${year}-${String(
          sequence.lastNumber,
        ).padStart(4, "0")}-V`;

        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            status: "DRAFT",
            invoiceDate: new Date(),
            dueDate,
            customerName: originalInvoice.customerName,
            customerEmail: originalInvoice.customerEmail,
            customerPhone: originalInvoice.customerPhone,
            customerAddress: originalInvoice.customerAddress,
            customerABN: originalInvoice.customerABN,
            subtotalExGST: subtotal,
            gstAmount: gst,
            totalIncGST: total,
            amountDue: total,
            discountAmount: discountAmountPersisted,
            discountPercentage: discountPercentagePersisted,
            shippingAmount: shippingAmountPersisted,
            notes:
              notes || `Variation of invoice ${originalInvoice.invoiceNumber}`,
            terms: terms || originalInvoice.terms,
            footer: originalInvoice.footer,
            originalInvoiceId: baseInvoiceId,
            reportId: originalInvoice.reportId,
            estimateId: originalInvoice.estimateId,
            clientId: originalInvoice.clientId,
            templateId: originalInvoice.templateId,
            userId: userId,
            lineItems: {
              create: lineItems.map((item: any, index: number) => {
                // Derive each line from the SAME per-item maths calc.ts uses for
                // the header: cents first, then multiply by quantity. Computing
                // `qty * unitPrice * 100` here instead differs by a cent whenever
                // quantity is fractional (InvoiceLineItem.quantity is Float —
                // hours and m² are normal on a restoration invoice), which would
                // make the header disagree with the sum of its own lines.
                const unitPriceCents = Math.round(item.unitPrice * 100);
                const lineSubtotal = Math.round(item.quantity * unitPriceCents);
                const gstRate = resolveLineGstRate(
                  item.gstRate,
                  inheritedGstRate,
                );
                const lineGst = Math.round(lineSubtotal * (gstRate / 100));

                return {
                  description: item.description,
                  category: item.category || null,
                  quantity: item.quantity,
                  unitPrice: unitPriceCents,
                  subtotal: lineSubtotal,
                  gstRate,
                  gstAmount: lineGst,
                  total: lineSubtotal + lineGst,
                  sortOrder: index,
                };
              }),
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

        await tx.invoiceAuditLog.create({
          data: {
            invoiceId: created.id,
            userId: userId,
            action: "variation_created",
            description: `Created variation from invoice ${originalInvoice.invoiceNumber}`,
            metadata: {
              originalInvoiceId: id,
              originalInvoiceNumber: originalInvoice.invoiceNumber,
            },
          },
        });

        await tx.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: userId,
            action: "variation_created",
            description: `Variation ${created.invoiceNumber} created`,
            metadata: {
              variationInvoiceId: created.id,
              variationInvoiceNumber: created.invoiceNumber,
            },
          },
        });

        return created;
      });

      return NextResponse.json({ variation }, { status: 201 });    } catch (error) {
      console.error("Error creating invoice variation:", error);
      return fromException(request, error, { stage: "create-variation" });
    }
  });
}
