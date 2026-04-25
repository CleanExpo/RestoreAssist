import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/integrations/xero/sync-status/[invoiceId]
 *
 * RA-1112 — Returns the current InvoiceSyncJob status for the given invoice
 * (Xero provider only). Auth-guarded; users can only see their own jobs.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, userId: session.user.id },
    select: { id: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const job = await prisma.invoiceSyncJob.findUnique({
    where: { invoiceId_provider: { invoiceId, provider: "XERO" } },
    select: { status: true, errorMessage: true, updatedAt: true },
  });

  if (!job) {
    return NextResponse.json({ status: null, lastError: null, updatedAt: null });
  }

  return NextResponse.json({
    status: job.status,
    lastError: job.errorMessage ?? null,
    updatedAt: job.updatedAt.toISOString(),
  });
}
