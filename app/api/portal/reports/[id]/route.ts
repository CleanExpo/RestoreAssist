import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { requireClientAuth } from "@/lib/portal/require-client-auth";

// GET /api/portal/reports/[id] - Get single report for logged-in client (bearer JWT)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;

    const { id: reportId } = await params;

    // Fetch report - verify it belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        propertyAddress: true,
        hazardType: true,
        totalCost: true,
        createdAt: true,
        updatedAt: true,
        completionDate: true,
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        user: {
          select: {
            name: true,
            businessName: true,
            businessPhone: true,
            businessEmail: true,
          },
        },
        approvals: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            approvalType: true,
            status: true,
            requestedAt: true,
            respondedAt: true,
            clientComments: true,
            amount: true,
          },
        },
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    return NextResponse.json({
      report: {
        ...report,
        description: null,
        scopeOfWorksDocument: null,
        costEstimationDocument: null,
      },
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    return fromException(request, error, { stage: "portal/reports:get" });
  }
}
