import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";

// PUT /api/inspections/[id]/sketches/[sketchId] — retired unsafe partial update
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

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Inspection not found",
        status: tenancy.status,
      });
    }
    return apiError(request, {
      code: "CONFLICT",
      message:
        "This partial sketch update endpoint is retired. Save through the inspection sketch endpoint so provenance, staleness and room-graph checks run.",
      status: 409,
      context: { inspectionId: id, sketchId },
    });
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

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Inspection not found",
        status: tenancy.status,
      });
    }

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

    await (prisma as any).claimSketch.delete({ where: { id: sketchId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromException(request, error, { stage: "sketch:delete" });
  }
}
