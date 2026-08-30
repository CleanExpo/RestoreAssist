import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { evaluateDrying } from "@/lib/anz/dry-standard";

// POST /api/inspections/[id]/sketches/[sketchId]/moisture-readings
// Records an S500 drying-log reading; dryStandardMet is computed server-side from
// the reading vs the material dry standard (spec §5.2).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const { id, sketchId } = await params;

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const body = await request.json();
    const {
      elementId,
      sketchRoomId,
      materialSlug,
      waterCategory,
      currentMc,
      targetMc,
      readingDatetime,
    } = body;

    const sketch = await (prisma as any).claimSketch.findFirst({
      where: { id: sketchId, inspectionId: id },
      select: { id: true },
    });
    if (!sketch) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Sketch not found",
        status: 404,
      });
    }

    if (elementId) {
      const element = await (prisma as any).sketchElement.findFirst({
        where: { id: elementId, sketchId },
        select: { id: true },
      });
      if (!element) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected element does not belong to this floor plan.",
          status: 422,
        });
      }
    }
    if (sketchRoomId) {
      const room = await (prisma as any).sketchRoom.findFirst({
        where: { id: sketchRoomId, sketchId, detachedAt: null },
        select: { id: true },
      });
      if (!room) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected room does not belong to this floor plan.",
          status: 422,
        });
      }
    }

    if (typeof currentMc !== "number") {
      return apiError(request, {
        code: "VALIDATION",
        message: "currentMc (number) is required",
        status: 422,
      });
    }

    let dryEval;
    try {
      dryEval = evaluateDrying({
        currentMc,
        targetMc,
        materialId: materialSlug,
      });
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Provide a known materialSlug or an explicit targetMc to evaluate the dry standard",
        status: 422,
      });
    }

    const materialId = materialSlug
      ? ((
          await (prisma as any).material.findUnique({
            where: { slug: materialSlug },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    const reading = await (prisma as any).sketchMoistureReading.create({
      data: {
        sketchId,
        elementId: elementId ?? null,
        sketchRoomId: sketchRoomId ?? null,
        materialId,
        waterCategory: waterCategory ?? null,
        targetMc: dryEval.targetMc,
        currentMc,
        dryStandardMet: dryEval.dryStandardMet,
        ...(readingDatetime
          ? { readingDatetime: new Date(readingDatetime) }
          : {}),
      },
    });

    return NextResponse.json({ reading }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "create-moisture-reading" });
  }
}
