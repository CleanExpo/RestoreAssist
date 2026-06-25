import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });

  try {
    const { id } = await params;
    const body = await request.json();
    const reconciled = body.reconciled ?? true;

    // Verify the payment belongs to this user via the invoice relation
    const existing = await prisma.invoicePayment.findFirst({
      where: {
        id,
        invoice: { userId: session.user.id },
      },
    });

    if (!existing)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Payment not found",
        status: 404,
      });

    const updated = await prisma.invoicePayment.update({
      where: { id, invoice: { userId: session.user.id } },
      data: {
        reconciled,
        reconciledAt: reconciled ? new Date() : null,
        reconciledBy: reconciled ? session.user.id : null,
      },
    });

    return NextResponse.json({ payment: updated });
  } catch (error) {
    return fromException(request, error, { stage: "update-payment" });
  }
}
