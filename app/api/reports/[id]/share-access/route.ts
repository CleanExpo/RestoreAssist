import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveReportFinancialReach } from "@/lib/auth/assert-tenancy";

/**
 * GET /api/reports/[id]/share-access — list active (non-revoked) share grants.
 */
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
    const reach = await resolveReportFinancialReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }

    const report = await prisma.report.findFirst({
      where: { AND: [{ id }, reach.data] },
      select: { id: true },
    });
    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const grants = await prisma.reportShareAccess.findMany({
      where: { reportId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        scope: true,
        expiresAt: true,
        createdAt: true,
        lastAccessedAt: true,
      },
    });

    return NextResponse.json({ grants });
  } catch (error) {
    return fromException(request, error, { stage: "share-access-list" });
  }
}
