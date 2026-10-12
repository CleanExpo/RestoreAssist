import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { sanitizeString } from "@/lib/sanitize";

/**
 * POST — invalidate a moisture reading (P2 / V1 P1-3). Source row is retained;
 * drying/PDF logic excludes invalidatedAt != null.
 */
export async function POST(
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

    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object") body = parsed;
    } catch {
      body = {};
    }

    const reasonRaw = body.reason ?? body.invalidationReason;
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? sanitizeString(reasonRaw.trim(), 2000)
        : null;
    if (!reason) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalidation reason is required",
        status: 400,
      });
    }

    const replacementReadingId =
      typeof body.replacementReadingId === "string" &&
      body.replacementReadingId.trim()
        ? body.replacementReadingId.trim()
        : null;

    if (replacementReadingId) {
      const replacement = await prisma.moistureReading.findFirst({
        where: {
          id: replacementReadingId,
          inspectionId: id,
          invalidatedAt: null,
        },
        select: { id: true },
      });
      if (!replacement) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Replacement reading not found on this job",
          status: 422,
        });
      }
    }

    const existing = await prisma.moistureReading.findFirst({
      where: {
        id: readingId,
        inspectionId: id,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      select: { id: true, invalidatedAt: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Reading not found",
        status: 404,
      });
    }
    if (existing.invalidatedAt) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Reading is already invalidated",
        status: 409,
      });
    }

    const now = new Date();
    const userId = session!.user!.id;

    await prisma.moistureReading.updateMany({
      where: { id: readingId, inspectionId: id },
      data: {
        invalidatedAt: now,
        invalidatedByUserId: userId,
        invalidationReason: reason,
        replacementReadingId,
      },
    });

    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Moisture reading invalidated",
        entityType: "MoistureReading",
        entityId: readingId,
        userId,
        changes: JSON.stringify({
          reason,
          replacementReadingId,
          invalidatedAt: now.toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      reading: {
        id: readingId,
        invalidatedAt: now.toISOString(),
        replacementReadingId,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "invalidate-moisture-reading" });
  }
}
