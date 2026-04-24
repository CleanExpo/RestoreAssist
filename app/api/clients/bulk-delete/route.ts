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
        message: "Sign in required",
        status: 401,
      });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "clients-bulk-delete",
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No client IDs provided",
        status: 400,
      });
    }

    const clients = await prisma.client.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    });

    if (clients.length !== ids.length) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Some clients not found or not authorized",
        status: 404,
      });
    }

    await prisma.client.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      message: `${ids.length} clients deleted successfully`,
      deletedCount: ids.length,
    });
  } catch (error) {
    return fromException(request, error, { stage: "clients-bulk-delete" });
  }
}
