/**
 * PATCH  /api/inspections/[id]/contents-pack-out/[itemId]
 *   Sets or clears the item's before / after photo (RA-8537). Photos only;
 *   the body is strict, so it cannot change a value or a decision.
 *
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific ContentsPackOutItem.
 *
 * Both stay owner/manager only (D-028: pack-out items carry money), so both
 * gate on resolveInspectionWrite, never the assigned-technician helper.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { packOutItemPhotosSchema } from "@/lib/contents/pack-out-item-schema";
import {
  resolvePackOutPhotos,
  signPackOutItemPhotos,
} from "@/lib/contents/pack-out-item-photos";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id, itemId } = await params;

    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const parsed = packOutItemPhotosSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const photos = await resolvePackOutPhotos(id, parsed.data);
    if (!photos.ok) {
      return apiError(req, {
        code: "VALIDATION",
        message: `${photos.field} is not a photo on this job. Upload it to the job's photos first.`,
        status: 400,
      });
    }

    // Scoped at write time (RA-6800): 0 rows if the caller lost the job or
    // the item is not on it.
    const updated = await prisma.contentsPackOutItem.updateMany({
      where: {
        id: itemId,
        inspectionId: id,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      data: photos.data,
    });
    if (updated.count === 0) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Item not found",
        status: 404,
      });
    }

    const item = await prisma.contentsPackOutItem.findFirst({
      where: { id: itemId, inspectionId: id },
    });
    if (!item) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Item not found",
        status: 404,
      });
    }
    return NextResponse.json(await signPackOutItemPhotos(item));
  } catch (err) {
    return fromException(req, err, { stage: "contents-pack-out:photos" });
  }
}

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
