import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveReportFinancialReach } from "@/lib/auth/assert-tenancy";
import { revokeReportShareAccess } from "@/lib/report-share/access";

/**
 * POST /api/reports/[id]/share-access/[accessId]/revoke
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; accessId: string }> },
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

    const { id, accessId } = await params;
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

    const revoked = await revokeReportShareAccess(accessId, id);
    if (!revoked) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Share link not found or already revoked",
        status: 404,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromException(request, error, { stage: "share-access-revoke" });
  }
}
