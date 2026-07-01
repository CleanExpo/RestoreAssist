import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; readingId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const { id, readingId } = await params;
    // Verify inspection belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!inspection) {
      return apiError(_request, { code: "NOT_FOUND", message: "Not found", status: 404 });
    }
    // deleteMany scopes the delete to this inspection — prevents cross-inspection IDOR
    const deleted = await prisma.moistureReading.deleteMany({
      where: {
        id: readingId,
        inspectionId: id,
        inspection: { userId: session.user.id },
      },
    });
    if (deleted.count === 0) {
      return apiError(_request, { code: "NOT_FOUND", message: "Reading not found", status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(_request, error, { stage: "delete-moisture-reading" });
  }
}
