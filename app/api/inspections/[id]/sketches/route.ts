import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";

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

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const sketches = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      take: 100,
      include: {
        annotations: {
          orderBy: { createdAt: "asc" },
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

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
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

    // RA-1762 — staleness guard. The offline sketch queue can hold a
    // payload whose logical timestamp predates the latest server write
    // (user dropped offline, drew, came back online and saved fresh,
    // then a slow queued POST finally arrives carrying the older state).
    // Without this check the older payload would clobber the newer one.
    //
    // Client sends `x-client-updated-at` (epoch ms or ISO) representing
    // the moment the sketch state was captured locally. If we already
    // have a newer row, return 409 with `{ stale: true }` so the queue
    // drain drops the entry silently rather than retrying or storing
    // a conflict record. Online-first saves can omit the header — the
    // null branch behaves like the old code.
    const clientUpdatedAtRaw = request.headers.get("x-client-updated-at");
    if (existing && clientUpdatedAtRaw) {
      const clientMs = Number.isFinite(Number(clientUpdatedAtRaw))
        ? Number(clientUpdatedAtRaw)
        : Date.parse(clientUpdatedAtRaw);
      const serverMs = new Date(existing.updatedAt).getTime();
      if (Number.isFinite(clientMs) && clientMs < serverMs) {
        return NextResponse.json(
          {
            stale: true,
            reason: "Server has a newer sketch for this floor",
            serverUpdatedAt: existing.updatedAt,
          },
          { status: 409 },
        );
      }
    }

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
