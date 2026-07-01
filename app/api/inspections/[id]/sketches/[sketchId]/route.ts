import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// PUT /api/inspections/[id]/sketches/[sketchId] — update sketch
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
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

    const { id, sketchId } = await params;

    const sketch = await (prisma as any).claimSketch.findFirst({
      where: { id: sketchId, inspection: { id, userId: session.user.id } },
    });
    if (!sketch) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Sketch not found",
        status: 404,
      });
    }

    const body = await request.json();
    const updated = await (prisma as any).claimSketch.update({
      where: { id: sketchId },
      data: {
        sketchType: body.sketchType ?? sketch.sketchType,
        sketchData:
          body.sketchData !== undefined ? body.sketchData : sketch.sketchData,
        backgroundImageUrl:
          body.backgroundImageUrl !== undefined
            ? body.backgroundImageUrl
            : sketch.backgroundImageUrl,
        moisturePoints:
          body.moisturePoints !== undefined
            ? body.moisturePoints
            : sketch.moisturePoints,
        equipmentPoints:
          body.equipmentPoints !== undefined
            ? body.equipmentPoints
            : sketch.equipmentPoints,
      },
      include: {
        annotations: {
          select: {
            id: true,
            sketchId: true,
            type: true,
            data: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return fromException(request, error, { stage: "sketch:update" });
  }
}

// DELETE /api/inspections/[id]/sketches/[sketchId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
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

    const { id, sketchId } = await params;

    const sketch = await (prisma as any).claimSketch.findFirst({
      where: { id: sketchId, inspection: { id, userId: session.user.id } },
    });
    if (!sketch) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Sketch not found",
        status: 404,
      });
    }

    await (prisma as any).claimSketch.delete({ where: { id: sketchId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromException(request, error, { stage: "sketch:delete" });
  }
}
