import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";
import { requireClientAuth } from "@/lib/portal/require-client-auth";
import { toClientPortalReportListItem } from "@/lib/portal/client-safe-report";

// GET /api/portal/reports - Get reports for logged-in client (bearer JWT)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;

    // Fetch all reports linked to this client
    const reports = await prisma.report.findMany({
      where: {
        clientId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        propertyAddress: true,
        hazardType: true,
        createdAt: true,
        updatedAt: true,
        completionDate: true,
        approvals: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const reportsWithApprovalStatus = reports.map((report) =>
      toClientPortalReportListItem(report),
    );

    return NextResponse.json({ reports: reportsWithApprovalStatus });
  } catch (error) {
    console.error("Error fetching client reports:", error);
    return fromException(request, error, { stage: "portal/reports:list" });
  }
}
