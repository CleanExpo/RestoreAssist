import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionAssignedWrite,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; readingId: string }> },
) {
  // P2 / V1 P1-3 — legacy DELETE becomes controlled invalidation (row retained).
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
  try {
    const now = new Date();
    const userId = session!.user!.id;
    const reason =
      "Removed via delete action (legacy API — reading retained for audit)";
    const updated = await prisma.moistureReading.updateMany({
      where: {
        id: readingId,
        inspectionId: id,
        invalidatedAt: null,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      data: {
        invalidatedAt: now,
        invalidatedByUserId: userId,
        invalidationReason: reason,
      },
    });
    if (updated.count === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Reading not found",
        status: 404,
      });
    }
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Moisture reading invalidated",
        entityType: "MoistureReading",
        entityId: readingId,
        userId,
        changes: JSON.stringify({ reason, invalidatedAt: now.toISOString() }),
      },
    });
    return NextResponse.json({ success: true, invalidated: true });
  } catch (error) {
    return fromException(request, error, { stage: "delete-moisture-reading" });
  }
}

/**
 * RA-7713 part 12 — set (or clear) a reading's floor-plan position.
 *
 * Body: { mapX: number, mapY: number } normalised 0-1 (clamped, as the
 * collection POST does), or { mapX: null, mapY: null } to unplace it. Writes
 * ONLY mapX/mapY. Scoped by assertInspectionAssignedWrite so the update re-asserts
 * the caller's write reach atomically.
 */
function parseCoordinate(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function parseMoistureFlag(value: unknown): boolean {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  return false;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; readingId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, readingId } = await params;
    const tenancy = await assertInspectionAssignedWrite(session, id);
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
    const hasMap =
      raw.mapX !== undefined ||
      raw.mapY !== undefined ||
      Object.prototype.hasOwnProperty.call(raw, "mapX") ||
      Object.prototype.hasOwnProperty.call(raw, "mapY");
    const hasFlags =
      raw.isBaseline !== undefined || raw.isMonitoringPoint !== undefined;

    const where = {
      id: readingId,
      inspectionId: id,
      invalidatedAt: null,
      ...(tenancy.data.childInspectionFilter && {
        inspection: tenancy.data.childInspectionFilter,
      }),
    };

    if (hasMap) {
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
        where,
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
    }

    if (hasFlags) {
      const data: { isBaseline?: boolean; isMonitoringPoint?: boolean } = {};
      if (raw.isBaseline !== undefined) {
        data.isBaseline = parseMoistureFlag(raw.isBaseline);
      }
      if (raw.isMonitoringPoint !== undefined) {
        data.isMonitoringPoint = parseMoistureFlag(raw.isMonitoringPoint);
      }
      const updated = await prisma.moistureReading.updateMany({ where, data });
      if (updated.count === 0) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Reading not found",
          status: 404,
        });
      }
      return NextResponse.json({ reading: { id: readingId, ...data } });
    }

    return apiError(request, {
      code: "VALIDATION",
      message:
        "Provide mapX/mapY for placement or isBaseline/isMonitoringPoint for role flags",
      status: 400,
    });
  } catch (error) {
    return fromException(request, error, { stage: "place-moisture-reading" });
  }
}
