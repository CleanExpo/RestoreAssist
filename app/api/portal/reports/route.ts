import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/portal/reports - Get reports for logged-in client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType !== "client") {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const clientId = session.user.clientId;

    if (!clientId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Client ID not found",
        status: 400,
      });
    }

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
        totalCost: true,
        createdAt: true,
        updatedAt: true,
        waterCategory: true,
        waterClass: true,
        completionDate: true,
        approvals: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    // Get approval statistics
    const reportsWithApprovalStatus = reports.map((report) => {
      const pendingApprovals = report.approvals.filter(
        (a) => a.status === "PENDING",
      ).length;
      const approvedCount = report.approvals.filter(
        (a) => a.status === "APPROVED",
      ).length;
      const rejectedCount = report.approvals.filter(
        (a) => a.status === "REJECTED",
      ).length;

      return {
        ...report,
        pendingApprovals,
        approvedCount,
        rejectedCount,
      };
    });

    return NextResponse.json({ reports: reportsWithApprovalStatus });
  } catch (error) {
    console.error("Error fetching client reports:", error);
    return fromException(request, error, { stage: "portal/reports:list" });
  }
}
