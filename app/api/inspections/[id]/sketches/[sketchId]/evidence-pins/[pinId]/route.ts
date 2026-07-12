import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { toNormalized } from "@/lib/sketch/pin-coords";

/** PATCH /api/inspections/[id]/sketches/[sketchId]/evidence-pins/[pinId] */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; sketchId: string; pinId: string }> },
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

    const { id, sketchId, pinId } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const existing = await prisma.evidencePin.findFirst({
      where: { id: pinId, sketchId },
      select: { id: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Pin not found",
        status: 404,
      });
    }

    const body = (await request.json()) as {
      x?: number;
      y?: number;
      nx?: number;
      ny?: number;
      canvasWidth?: number;
      canvasHeight?: number;
      sketchRoomId?: string | null;
      caption?: string | null;
      rotationDeg?: number;
      scale?: number;
      fileUrl?: string | null;
      thumbnailUrl?: string | null;
    };

    let nx = body.nx;
    let ny = body.ny;
    if (
      typeof body.x === "number" &&
      typeof body.y === "number" &&
      (nx == null || ny == null) &&
      typeof body.canvasWidth === "number" &&
      typeof body.canvasHeight === "number"
    ) {
      const n = toNormalized(body.x, body.y, body.canvasWidth, body.canvasHeight);
      nx = n.nx;
      ny = n.ny;
    }

    const pin = await prisma.evidencePin.update({
      where: { id: pinId },
      data: {
        ...(typeof body.x === "number" ? { x: body.x } : {}),
        ...(typeof body.y === "number" ? { y: body.y } : {}),
        ...(nx != null ? { nx } : {}),
        ...(ny != null ? { ny } : {}),
        ...(body.sketchRoomId !== undefined
          ? { sketchRoomId: body.sketchRoomId }
          : {}),
        ...(body.caption !== undefined ? { caption: body.caption } : {}),
        ...(typeof body.rotationDeg === "number"
          ? { rotationDeg: body.rotationDeg }
          : {}),
        ...(typeof body.scale === "number" ? { scale: body.scale } : {}),
        ...(body.fileUrl !== undefined ? { fileUrl: body.fileUrl } : {}),
        ...(body.thumbnailUrl !== undefined
          ? { thumbnailUrl: body.thumbnailUrl }
          : {}),
      },
      select: {
        id: true,
        sketchId: true,
        sketchRoomId: true,
        kind: true,
        x: true,
        y: true,
        nx: true,
        ny: true,
        rotationDeg: true,
        scale: true,
        fileUrl: true,
        thumbnailUrl: true,
        caption: true,
        syncState: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ pin });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-pins:update" });
  }
}

/** DELETE /api/inspections/[id]/sketches/[sketchId]/evidence-pins/[pinId] */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; sketchId: string; pinId: string }> },
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

    const { id, sketchId, pinId } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const existing = await prisma.evidencePin.findFirst({
      where: { id: pinId, sketchId },
      select: { id: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Pin not found",
        status: 404,
      });
    }

    await prisma.evidencePin.delete({ where: { id: pinId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-pins:delete" });
  }
}
