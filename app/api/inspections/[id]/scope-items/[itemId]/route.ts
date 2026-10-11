import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import {
  hasDisposalAuthorityForInspection,
  scopeItemRequiresDisposalAuthority,
} from "@/lib/compliance/disposal-authority-gate";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });

    const { id, itemId } = await params;

    // Verify inspection ownership
    // D-028: the owner's reach, plus the technician assigned to the job.
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    const inspection = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true },
    });
    if (!inspection)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });

    const body = await request.json();
    // Update only provided fields
    // Scope update to this inspection — prevents cross-inspection IDOR
    const item = await prisma.scopeItem.findFirst({
      where: { id: itemId, inspectionId: id },
      select: { id: true, itemType: true, isSelected: true },
    });
    if (!item)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });

    if (body.quantity !== undefined && body.quantity !== null) {
      const qty = Number(body.quantity);
      if (!isFinite(qty) || qty < 0 || qty > 100_000) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "quantity must be a non-negative finite number up to 100,000",
          status: 400,
        });
      }
    }

    const selectingDisposal =
      body.isSelected === true &&
      scopeItemRequiresDisposalAuthority(item.itemType);
    if (selectingDisposal) {
      const authorised = await hasDisposalAuthorityForInspection(
        prisma,
        id,
      );
      if (!authorised) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Disposal or strip-out scope requires a recorded disposal authority before selection.",
          status: 409,
          fields: { disposalAuthority: "Record authority via POST /disposal-authority" },
        });
      }
    }

    if (
      body.sketchRoomId !== undefined &&
      body.sketchRoomId !== null &&
      body.sketchRoomId !== ""
    ) {
      const sketchRoomId = String(body.sketchRoomId);
      const room = await prisma.sketchRoom.findFirst({
        where: {
          id: sketchRoomId,
          sketch: { inspectionId: id },
        },
        select: { id: true },
      });
      if (!room) {
        return apiError(request, {
          code: "VALIDATION",
          message: "sketchRoomId must belong to this job's sketch",
          status: 422,
        });
      }
    }

    const updated = await prisma.scopeItem.update({
      where: {
        id: itemId,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      data: {
        ...(body.description !== undefined && {
          description: String(body.description).slice(0, 2000),
        }),
        ...(body.quantity !== undefined && {
          quantity: body.quantity !== null ? Number(body.quantity) : null,
        }),
        ...(body.unit !== undefined && {
          unit: body.unit ? String(body.unit).slice(0, 50) : null,
        }),
        ...(body.isSelected !== undefined && {
          isSelected: Boolean(body.isSelected),
        }),
        ...(body.justification !== undefined && {
          justification: body.justification
            ? String(body.justification).slice(0, 2000)
            : null,
        }),
        ...(body.sketchRoomId !== undefined && {
          sketchRoomId:
            body.sketchRoomId === null || body.sketchRoomId === ""
              ? null
              : String(body.sketchRoomId),
        }),
      },
    });
    return NextResponse.json({ scopeItem: updated });
  } catch (err) {
    return fromException(request, err, { stage: "scope-items:patch" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });

    const { id, itemId } = await params;

    // D-028: the owner's reach, plus the technician assigned to the job.
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    const inspection = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true },
    });
    if (!inspection)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });

    // deleteMany scopes the delete to this inspection — prevents cross-inspection IDOR
    const deleted = await prisma.scopeItem.deleteMany({
      where: {
        id: itemId,
        inspectionId: id,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
    });
    if (deleted.count === 0)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, { stage: "scope-items:delete" });
  }
}
