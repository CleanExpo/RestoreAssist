import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// Default unit price in cents ($50.00)
const DEFAULT_UNIT_PRICE_CENTS = 5000;
const GST_RATE = 10.0;

// GET — return existing invoice generated from this inspection (if any)
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

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, inspectionNumber: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Look up invoice by notes containing inspectionNumber
    const invoice = await prisma.invoice.findFirst({
      where: {
        userId: session.user.id,
        notes: { contains: inspection.inspectionNumber },
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
      orderBy: { createdAt: "desc" },
    });

    if (!invoice) {
      return NextResponse.json({ invoice: null });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-generate-invoice-get",
    });
  }
}

// POST — generate an Invoice from the inspection's selected ScopeItems
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

  // RA-1266: CRITICAL — generates an Invoice from scope items. Retry
  // without idempotency would create two invoices for the same job.
  return withIdempotency(request, userId, async () => {
    try {
      // Verify inspection ownership
      const inspection = await prisma.inspection.findFirst({
        where: { id, userId: userId },
        include: {
          scopeItems: {
            where: { isSelected: true },
            orderBy: { createdAt: "asc" },
            select: {
              quantity: true,
              description: true,
              itemType: true,
            },
          },
        },
      });

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      if (inspection.scopeItems.length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "No selected scope items found. Select at least one scope item before generating an invoice.",
          status: 400,
        });
      }

      // Get the user's first Client record for customer details
      const client = await prisma.client.findFirst({
        where: { userId: userId },
        orderBy: { createdAt: "asc" },
      });

      // Resolve customer details
      const customerName =
        client?.name ?? inspection.technicianName ?? "Unknown";
      const customerEmail =
        client?.email ?? session.user.email ?? "unknown@example.com";

      // Due date: 14 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      // Build line items
      let subtotalExGST = 0;
      let gstAmount = 0;

      const lineItemsData = inspection.scopeItems.map((item, index) => {
        const quantity = item.quantity ?? 1;
        const unitPrice = DEFAULT_UNIT_PRICE_CENTS;
        const subtotal = Math.round(quantity * unitPrice);
        const itemGst = Math.round(subtotal * (GST_RATE / 100));
        const total = subtotal + itemGst;

        subtotalExGST += subtotal;
        gstAmount += itemGst;

        return {
          description: item.description,
          category: item.itemType ?? "Restoration",
          quantity,
          unitPrice,
          subtotal,
          gstRate: GST_RATE,
          gstAmount: itemGst,
          total,
          sortOrder: index,
        };
      });

      const totalIncGST = subtotalExGST + gstAmount;
      const notes = `Generated from inspection ${inspection.inspectionNumber} — ${inspection.propertyAddress}`;

      // Use the invoice sequence to generate a number, within a transaction
      const year = new Date().getFullYear();

      const runCreate = async () =>
        prisma.$transaction(async (tx) => {
          const sequence = await tx.invoiceSequence.upsert({
            where: { userId_year: { userId: userId, year } },
            update: { lastNumber: { increment: 1 } },
            create: {
              userId: userId,
              year,
              prefix: "RA",
              lastNumber: 1,
            },
          });
          const invoiceNumber = `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;

          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              status: "DRAFT",
              userId: userId,
              clientId: client?.id ?? null,
              customerName,
              customerEmail,
              customerAddress:
                client?.address ?? inspection.propertyAddress ?? null,
              invoiceDate: new Date(),
              dueDate,
              subtotalExGST,
              gstAmount,
              totalIncGST,
              amountDue: totalIncGST,
              notes,
              source: "inspection",
              lineItems: {
                create: lineItemsData,
              },
            },
            include: {
              // Only `lineItems.length` is read in the response (line below);
              // selecting `id` keeps the relation contract explicit.
              lineItems: {
                orderBy: { sortOrder: "asc" },
                select: { id: true },
              },
            },
          });

          await tx.invoiceAuditLog.create({
            data: {
              invoiceId: invoice.id,
              userId: userId,
              action: "created",
              description: `Invoice ${invoiceNumber} generated from inspection ${inspection.inspectionNumber}`,
            },
          });

          return invoice;
        });

      let invoice;
      try {
        invoice = await runCreate();
      } catch (firstError: any) {
        if (firstError?.code === "P2002") {
          // Sequence conflict — sync and retry
          const prefix = "RA";
          const latestInvoice = await prisma.invoice.findFirst({
            where: {
              userId: userId,
              invoiceNumber: { startsWith: `${prefix}-${year}-` },
            },
            select: { invoiceNumber: true },
            orderBy: { invoiceNumber: "desc" },
          });
          const latestNumber = latestInvoice
            ? parseInt(
                latestInvoice.invoiceNumber.replace(`${prefix}-${year}-`, ""),
                10,
              )
            : 0;
          const maxNum = Number.isNaN(latestNumber) ? 0 : latestNumber;
          await prisma.invoiceSequence.upsert({
            where: { userId_year: { userId: userId, year } },
            update: { lastNumber: maxNum },
            create: {
              userId: userId,
              year,
              prefix: "RA",
              lastNumber: maxNum,
            },
          });
          invoice = await runCreate();
        } else {
          throw firstError;
        }
      }

      return NextResponse.json(
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalIncGST: invoice.totalIncGST,
          lineItemCount: invoice.lineItems.length,
        },
        { status: 201 },
      );
    } catch (error) {
      return fromException(request, error, {
        stage: "inspection-generate-invoice-post",
      });
    }
  });
}
