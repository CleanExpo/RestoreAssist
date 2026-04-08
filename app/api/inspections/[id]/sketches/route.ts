import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/inspections/[id]/sketches — list all sketches for an inspection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const sketches = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      include: {
        annotations: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ floorNumber: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ sketches });
  } catch (error) {
    console.error("GET /api/inspections/[id]/sketches error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sketches" },
      { status: 500 },
    );
  }
}

// POST /api/inspections/[id]/sketches — create or upsert a sketch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      floorNumber = 0,
      floorLabel = "Ground Floor",
      sketchType = "structural",
      sketchData,
      backgroundImageUrl,
      moisturePoints,
      equipmentPoints,
    } = body;

    // If a sketch already exists for this floor, update it; otherwise create
    const existing = await (prisma as any).claimSketch.findFirst({
      where: { inspectionId: id, floorNumber },
    });

    const sketch = existing
      ? await (prisma as any).claimSketch.update({
          where: { id: existing.id },
          data: {
            sketchType,
            sketchData: sketchData ?? undefined,
            backgroundImageUrl: backgroundImageUrl ?? undefined,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
          },
        })
      : await (prisma as any).claimSketch.create({
          data: {
            inspectionId: id,
            floorNumber,
            floorLabel,
            sketchType,
            sketchData: sketchData ?? undefined,
            backgroundImageUrl: backgroundImageUrl ?? undefined,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
          },
        });

    return NextResponse.json(sketch, { status: 201 });
  } catch (error) {
    console.error("POST /api/inspections/[id]/sketches error:", error);
    return NextResponse.json(
      { error: "Failed to save sketch" },
      { status: 500 },
    );
  }
}
