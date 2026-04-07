import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/inspections/[id]/sketches/[sketchId] — update sketch
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sketchId } = await params;

    const sketch = await prisma.claimSketch.findFirst({
      where: { id: sketchId, inspection: { id, userId: session.user.id } },
    });
    if (!sketch) {
      return NextResponse.json({ error: "Sketch not found" }, { status: 404 });
    }

    const body = await request.json();
    const updated = await prisma.claimSketch.update({
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
      include: { annotations: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT sketch error:", error);
    return NextResponse.json(
      { error: "Failed to update sketch" },
      { status: 500 },
    );
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sketchId } = await params;

    const sketch = await prisma.claimSketch.findFirst({
      where: { id: sketchId, inspection: { id, userId: session.user.id } },
    });
    if (!sketch) {
      return NextResponse.json({ error: "Sketch not found" }, { status: 404 });
    }

    await prisma.claimSketch.delete({ where: { id: sketchId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE sketch error:", error);
    return NextResponse.json(
      { error: "Failed to delete sketch" },
      { status: 500 },
    );
  }
}
