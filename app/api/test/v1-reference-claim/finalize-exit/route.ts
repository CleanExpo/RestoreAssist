/**
 * TEST-ONLY — after EFT payment API: reconcile payments, mark Xero sync, record report delivery for close.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { testHelpersBlocked } from "../../_helpers";
import { seedReportDeliveryForClose } from "@/lib/v1/reference-claim-exit-spine";

export async function POST(req: NextRequest) {
  if (testHelpersBlocked()) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: { inspectionId?: string; invoiceId?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    body = {};
  }

  const { inspectionId, invoiceId } = body;
  if (!inspectionId || !invoiceId) {
    return apiError(req, {
      code: "VALIDATION",
      message: "inspectionId and invoiceId required",
      status: 400,
    });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, userId: session.user.id },
    select: {
      id: true,
      reportId: true,
      client: { select: { email: true } },
    },
  });
  if (!inspection?.reportId) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoicePayment.updateMany({
      where: { invoiceId, invoice: { userId: session.user.id } },
      data: {
        reconciled: true,
        reconciledAt: new Date(),
        reconciledBy: session.user.id,
      },
    });

    await tx.invoice.updateMany({
      where: { id: invoiceId, userId: session.user.id },
      data: {
        externalSyncProvider: "XERO",
        externalInvoiceId: `v1-xero-${invoiceId}`,
        externalSyncStatus: "SYNCED",
        externalSyncedAt: new Date(),
      },
    });

    await seedReportDeliveryForClose(tx, {
      inspectionId,
      reportId: inspection.reportId!,
      ownerUserId: session.user.id,
      clientEmail: inspection.client?.email ?? "ref-client@example.com",
    });
  });

  return NextResponse.json({ ok: true });
}
