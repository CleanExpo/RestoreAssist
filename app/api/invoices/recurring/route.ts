import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch recurring invoices" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
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
      return NextResponse.json(
        {
          error:
            "templateName, customerName, customerEmail, frequency, and startDate are required",
        },
        { status: 422 },
      );
    }

    const start = new Date(startDate);
    const nextInvoiceDate = nextDateFromFrequency(start, frequency);

    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      gstRate?: number;
    }> = Array.isArray(lineItems) ? lineItems : [];

    const subtotalExGST = items.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
      0,
    );
    const gstAmount = items.reduce(
      (sum, item) =>
        sum +
        Math.round(
          item.quantity * item.unitPrice * ((item.gstRate ?? 10) / 100),
        ),
      0,
    );
    const totalIncGST = subtotalExGST + gstAmount;

    const recurringInvoice = await prisma.recurringInvoice.create({
      data: {
        templateName,
        description: description || null,
        userId: session.user.id,
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
        lineItemsTemplate: items,
        dueInDays: dueInDays ?? 30,
        terms: terms || null,
        notes: notes || null,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ recurringInvoice }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create recurring invoice" },
      { status: 500 },
    );
  }
}
