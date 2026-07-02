import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// Delete multiple inspections (user must own all).
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

    let body: any;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "At least one inspection id is required",
        status: 400,
      });
    }

    // Only delete inspections that belong to the current user
    const deleted = await prisma.inspection.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    });
  } catch (error) {
    return fromException(request, error, { stage: "inspections-bulk-delete" });
  }
}

export async function DELETE(request: NextRequest) {
  return handleBulkDelete(request);
}

export async function POST(request: NextRequest) {
  return handleBulkDelete(request);
}
