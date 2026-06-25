import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/portal/reports/[id] - Get single report for logged-in client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id: reportId } = await params;

    // Fetch report - verify it belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
      include: {
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

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Error fetching report:", error);
    return fromException(request, error, { stage: "portal/reports:get" });
  }
}
