/**
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific ContentsPackOutItem.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id, itemId } = await params;

    // RA-1711 batch 3 — adopt shared tenancy helper.
    // RA-6800 — scope the child write so ownership is re-asserted atomically.
    const tenancy = await resolveInspectionWrite(session, id);
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
      return apiError(_req, {
        code: "NOT_FOUND",
        message: "Item not found",
        status: 404,
      });
    }

    await prisma.contentsPackOutItem.delete({
      where: {
        id: itemId,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fromException(_req, err, { stage: "contents-pack-out:delete" });
  }
}
