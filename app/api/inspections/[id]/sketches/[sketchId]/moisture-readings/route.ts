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
      materialSlug,
      waterCategory,
      currentMc,
      targetMc,
      readingDatetime,
    } = body;

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
