/**
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific ContentsPackOutItem.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;

  // RA-1711 batch 3 — adopt shared tenancy helper.
  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  // Verify item belongs to this inspection
  const item = await prisma.contentsPackOutItem.findFirst({
    where: { id: itemId, inspectionId: id },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.contentsPackOutItem.delete({
    where: { id: itemId, inspectionId: id },
  });

  return NextResponse.json({ deleted: true });
}
