import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/integrations/xero/dead-letter-count
 *
 * RA-1112 — Returns the count of FAILED InvoiceSyncJob records for the
 * current user that are older than 24 hours (i.e. dead-lettered). Used
 * by the dead-letter banner in the dashboard.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // InvoiceSyncJob has no @relation to Invoice — resolve user's invoice IDs first
  const userInvoices = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const invoiceIds = userInvoices.map((inv) => inv.id);

  if (invoiceIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const count = await prisma.invoiceSyncJob.count({
    where: {
      invoiceId: { in: invoiceIds },
      provider: "XERO",
      status: "FAILED",
      updatedAt: { lt: cutoff },
    },
  });

  return NextResponse.json({ count });
}
