import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateInsurerToken,
  insurerTokenExpiresAt,
} from "@/lib/portal-token";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveReportFinancialReach } from "@/lib/auth/assert-tenancy";

/**
 * POST /api/reports/[id]/share-link  (RA-1460)
 *
 * Generates a 30-day HMAC-signed share URL for the property owner's
 * damage report view at /reports/[id]/view?token=...
 *
 * Reuses the insurer-token namespace — both personas need the same
 * report-scoped, read-only, no-login access.
 */
export async function POST(
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

    // RA-7771 / D-023: the homeowner view the link opens shows the report
    // total, so minting one follows the financial reach, as insurer-link does:
    // the organisation widening stops at MANAGER. Reach is merged with AND.
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
      select: { id: true, reportNumber: true, propertyAddress: true },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const token = generateInsurerToken(report.id);
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      "https://restoreassist.app";
    const url = `${baseUrl}/reports/${report.id}/view?token=${token}`;

    return NextResponse.json({
      url,
      token,
      expiresAt: insurerTokenExpiresAt(),
      reportNumber: report.reportNumber,
      propertyAddress: report.propertyAddress,
    });
  } catch (error) {
    return fromException(request, error, { stage: "share" });
  }
}
