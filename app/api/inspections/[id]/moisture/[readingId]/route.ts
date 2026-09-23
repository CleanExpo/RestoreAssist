import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";

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

/**
 * RA-7713 part 12 — set (or clear) a reading's floor-plan position.
 *
 * Body: { mapX: number, mapY: number } normalised 0-1 (clamped, as the
 * collection POST does), or { mapX: null, mapY: null } to unplace it. Writes
 * ONLY mapX/mapY. Scoped by resolveInspectionWrite so the update re-asserts
 * the caller's write reach atomically.
 */
function parseCoordinate(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; readingId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, readingId } = await params;
    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code:
          tenancy.status === 401
            ? "UNAUTHORIZED"
            : tenancy.status === 403
              ? "FORBIDDEN"
              : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const raw = (body && typeof body === "object" ? body : {}) as Record<
      string,
      unknown
    >;
    const mapX = parseCoordinate(raw.mapX);
    const mapY = parseCoordinate(raw.mapY);
    if (
      mapX === undefined ||
      mapY === undefined ||
      (mapX === null) !== (mapY === null)
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "mapX and mapY must both be numbers between 0 and 1, or both null",
        status: 400,
      });
    }

    const updated = await prisma.moistureReading.updateMany({
      where: {
        id: readingId,
        inspectionId: id,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      data: { mapX, mapY },
    });
    if (updated.count === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Reading not found",
        status: 404,
      });
    }
    return NextResponse.json({ reading: { id: readingId, mapX, mapY } });
  } catch (error) {
    return fromException(request, error, { stage: "place-moisture-reading" });
  }
}
