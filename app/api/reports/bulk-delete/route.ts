import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Rate limit: 10 bulk deletes per 15 minutes per IP
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "reports-bulk-delete",
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No report IDs provided",
        status: 400,
      });
    }

    if (ids.length > 100) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Maximum 100 reports can be deleted at once",
        status: 400,
      });
    }

    // Verify all reports belong to the user
    const reports = await prisma.report.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
      select: { id: true },
      take: ids.length,
    });

    if (reports.length !== ids.length) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Some reports not found or not authorized",
        status: 404,
      });
    }

    // Delete all reports
    await prisma.report.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      message: `${ids.length} reports deleted successfully`,
      deletedCount: ids.length,
    });
  } catch (error) {
    return fromException(request, error, { stage: "bulk-delete" });
  }
}
