import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { id: inspectionId, areaId } = await params;

    // Verify inspection belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Verify area belongs to inspection
    const area = await prisma.affectedArea.findFirst({
      where: { id: areaId, inspectionId },
    });
    if (!area) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    await prisma.affectedArea.delete({
      where: { id: areaId, inspection: { userId: session.user.id } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, { stage: "affected-areas:delete" });
  }
}
