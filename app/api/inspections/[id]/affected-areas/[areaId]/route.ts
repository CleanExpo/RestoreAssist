import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { deriveAreaColumns } from "@/lib/units";
import { z } from "zod";

const patchSchema = z.object({
  roomZoneId: z.string().trim().min(1).max(200).optional(),
  affectedAreaSqm: z.number().positive().max(9_290).optional(),
  affectedSquareFootage: z.number().positive().optional(),
  waterSource: z.string().trim().min(1).max(200).optional(),
  timeSinceLoss: z.number().nonnegative().max(100_000).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId, areaId } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const area = await prisma.affectedArea.findFirst({
      where: { id: areaId, inspectionId },
    });
    if (!area) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Area not found",
        status: 404,
      });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid patch",
        status: 400,
      });
    }

    const body = parsed.data;
    const areaColumns =
      body.affectedAreaSqm !== undefined ||
      body.affectedSquareFootage !== undefined
        ? deriveAreaColumns(body)
        : null;

    if (
      (body.affectedAreaSqm !== undefined ||
        body.affectedSquareFootage !== undefined) &&
      !areaColumns
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Affected area (m²) must be a finite number between 0 and 9,290",
        status: 400,
      });
    }

    const updated = await prisma.affectedArea.update({
      where: { id: areaId },
      data: {
        ...(body.roomZoneId !== undefined && { roomZoneId: body.roomZoneId }),
        ...(areaColumns ?? {}),
        ...(body.waterSource !== undefined && {
          waterSource: body.waterSource,
        }),
        ...(body.timeSinceLoss !== undefined && {
          timeSinceLoss: body.timeSinceLoss,
        }),
        ...(body.description !== undefined && {
          description: body.description,
        }),
      },
    });

    return NextResponse.json({ affectedArea: updated });
  } catch (err) {
    return fromException(request, err, { stage: "affected-areas:patch" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { id: inspectionId, areaId } = await params;

    // Verify inspection belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Verify area belongs to inspection
    const area = await prisma.affectedArea.findFirst({
      where: { id: areaId, inspectionId },
    });
    if (!area) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    await prisma.affectedArea.delete({
      where: { id: areaId, inspection: { userId: session.user.id } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, { stage: "affected-areas:delete" });
  }
}
