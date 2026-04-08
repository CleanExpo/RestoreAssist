/**
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific ContentsPackOutItem.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify inspection ownership
  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  // Verify item belongs to this inspection
  const item = await (prisma as any).contentsPackOutItem.findFirst({
    where: { id: params.itemId, inspectionId: params.id },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await (prisma as any).contentsPackOutItem.delete({
    where: { id: params.itemId },
  });

  return NextResponse.json({ deleted: true });
}
