import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// Delete multiple interview sessions (user must own all).
// DELETE is the canonical verb (REST); POST kept for backwards compatibility.
async function handleBulkDelete(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    let body: { ids?: unknown };
    try {
      const parsedBody = await request.json();
      body =
        parsedBody && typeof parsedBody === "object"
          ? (parsedBody as { ids?: unknown })
          : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const ids = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "At least one session id is required",
        status: 400,
      });
    }

    const deleted = await prisma.interviewSession.deleteMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    });
  } catch (error) {
    return fromException(request, error, { stage: "bulk-delete" });
  }
}

export async function DELETE(request: NextRequest) {
  return handleBulkDelete(request);
}

export async function POST(request: NextRequest) {
  return handleBulkDelete(request);
}
