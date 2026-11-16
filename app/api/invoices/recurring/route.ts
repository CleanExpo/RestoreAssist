import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveUserGstTreatment } from "@/lib/gst/resolve-user-gst";
import { resolveLineGstRatePercent } from "@/lib/gst-rules";
import { lineAmountsCents } from "@/lib/invoices/calc";
import { validateMoneyLines } from "@/lib/invoices/validate-money-lines";
import { assertFinancialWriter, canLinkRecord } from "@/lib/auth/assert-tenancy";
import { RecurringFrequency } from "@prisma/client";

function nextDateFromFrequency(start: Date, frequency: string): Date {
  const d = new Date(start);
  switch (frequency) {
    case "WEEKLY":
      d.setDate(d.getDate() + 7);
      break;
    case "FORTNIGHTLY":
      d.setDate(d.getDate() + 14);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1);
      break;
    case "QUARTERLY":
      d.setMonth(d.getMonth() + 3);
      break;
    case "SEMI_ANNUALLY":
      d.setMonth(d.getMonth() + 6);
      break;
    case "ANNUALLY":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d;
}

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

    const recurringInvoices = await prisma.recurringInvoice.findMany({
      where: { userId: session.user.id },
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ recurringInvoices });
  } catch (error) {
    return fromException(request, error, { stage: "list-recurring" });
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
  // Creating a money record is an owner or manager action. The role is read
  // from the database (a JWT role can be stale), before the body is parsed.
  const moneyGate = await assertFinancialWriter(session);
  if (!moneyGate.ok) {
    return apiError(request, {
      code: moneyGate.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message: moneyGate.reason,
      status: moneyGate.status,
    });
  }

  // RA-1266: Idempotency-Key prevents duplicate recurring-template creation
  // (which would then spawn duplicate invoices on every cycle).
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
        templateName,
        description,
        clientId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        frequency,
        startDate,
        endDate,
        lineItems,
        dueInDays,
        terms,
        notes,
      } = body;

      if (
        !templateName ||
        !customerName ||
        !customerEmail ||
        !frequency ||
        !startDate
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "templateName, customerName, customerEmail, frequency, and startDate are required",
          status: 422,
        });
      }

      // D-021: the template's client is read back through GET, so the id must
      // be one the caller can already read.
      if (clientId && !(await canLinkRecord(session, "client", clientId))) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Client not found",
          status: 404,
        });
      }

      if (!Object.values(RecurringFrequency).includes(frequency)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `frequency must be one of ${Object.values(RecurringFrequency).join(", ")}`,
          status: 400,
          fields: { frequency: "Unknown frequency" },
        });
      }
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        return apiError(request, {
          code: "VALIDATION",
          message: "startDate must be a valid date",
          status: 400,
          fields: { startDate: "Invalid date" },
        });
      }
      const nextInvoiceDate = nextDateFromFrequency(start, frequency);
      const gstTreatment = await resolveUserGstTreatment(userId);

      const items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        gstRate?: number;
        category?: string | null;
      }> = Array.isArray(lineItems) ? lineItems : [];

      // RA-8398: the one shared line check. Before this, quantity and unit
      // price were not checked here, so a negative or non-numeric value
      // saved a negative or NaN total, and an empty list saved a zero total.
      const lineError = validateMoneyLines(request, lineItems);
      if (lineError) return lineError;

      // RA-7705: the invoice rule — each line rounded to cents in decimal,
      // GST on the rounded line.
      const lines = items.map((item) =>
        lineAmountsCents(
          Number(item.quantity),
          Math.round(Number(item.unitPrice)),
          resolveLineGstRatePercent(item.gstRate, gstTreatment),
        ),
      );
      const subtotalExGST = lines.reduce((sum, l) => sum + l.subtotal, 0);
      const gstAmount = lines.reduce((sum, l) => sum + l.gstAmount, 0);
      const totalIncGST = subtotalExGST + gstAmount;

      const recurringInvoice = await prisma.recurringInvoice.create({
        data: {
          templateName,
          description: description || null,
          userId,
          clientId: clientId || null,
          customerName,
          customerEmail,
          customerPhone: customerPhone || null,
          customerAddress: customerAddress || null,
          frequency,
          startDate: start,
          endDate: endDate ? new Date(endDate) : null,
          nextInvoiceDate,
          subtotalExGST,
          gstAmount,
          totalIncGST,
          // RA-8398: store only the template fields (schema comment on
          // lineItemsTemplate), never whatever extra keys the caller sent.
          lineItemsTemplate: items.map((item) => ({
            description: item.description,
            category: item.category ?? null,
            quantity: Number(item.quantity),
            unitPrice: Math.round(Number(item.unitPrice)),
            gstRate: resolveLineGstRatePercent(item.gstRate, gstTreatment),
          })),
          dueInDays: dueInDays ?? 30,
          terms: terms || null,
          notes: notes || null,
          status: "ACTIVE",
        },
      });

      return NextResponse.json({ recurringInvoice }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "create-recurring" });
    }
  });
}
