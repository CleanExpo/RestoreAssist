/**
 * POST /api/inspections/[id]/lidar-scan
 *
 * Persists a LiDAR scan result from the iOS RoomPlan client or BLE tape.
 * Creates a LidarScan record and optionally a FloorPlan record if SVG data
 * is provided.
 *
 * Body:
 * {
 *   roomName?: string
 *   areaSqm: number
 *   ceilingHeight?: number
 *   dimensions?: { width: number; length: number; height: number }
 *   svgData?: string
 *   rawDataUrl?: string        // Cloudinary URL from pre-upload
 *   fileFormat?: string        // "ply" | "obj" | "svg" | "json"
 *   fileSize?: number          // bytes
 *   pointCount?: number
 *   scanDuration?: number      // seconds
 *   source: "roomplan" | "ble_tape" | "manual"
 * }
 *
 * GET /api/inspections/[id]/lidar-scan — lists all scans for the inspection.
 *
 * RA-1133
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface LidarScanBody {
  roomName?: string;
  areaSqm: number;
  ceilingHeight?: number;
  dimensions?: { width: number; length: number; height: number };
  svgData?: string;
  rawDataUrl?: string;
  fileFormat?: string;
  fileSize?: number;
  pointCount?: number;
  scanDuration?: number;
  source: "roomplan" | "ble_tape" | "manual";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { userId: true },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: LidarScanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.areaSqm || body.areaSqm <= 0) {
    return NextResponse.json({ error: "areaSqm must be a positive number" }, { status: 400 });
  }

  const dimensionsJson = body.dimensions
    ? JSON.stringify({
        width: body.dimensions.width,
        length: body.dimensions.length,
        height: body.dimensions.height ?? body.ceilingHeight,
        area: body.areaSqm,
      })
    : JSON.stringify({ area: body.areaSqm, height: body.ceilingHeight });

  const scan = await prisma.lidarScan.create({
    data: {
      inspectionId,
      roomName: body.roomName ?? null,
      rawDataUrl: body.rawDataUrl ?? `lidar://${body.source}/${Date.now()}`,
      fileFormat: body.fileFormat ?? body.source === "roomplan" ? "obj" : "json",
      fileSize: body.fileSize ?? 0,
      pointCount: body.pointCount ?? null,
      scanDuration: body.scanDuration ?? null,
      dimensions: dimensionsJson,
      processingStatus: body.svgData ? "completed" : "pending",
      processedAt: body.svgData ? new Date() : null,
      uploadedBy: session.user.id,
    },
  });

  // Create FloorPlan record if SVG data is provided
  let floorPlan = null;
  if (body.svgData) {
    floorPlan = await (prisma as any).floorPlan.create({
      data: {
        scanId: scan.id,
        imageUrl: `lidar://${scan.id}/svg`,
        svgData: body.svgData,
        svgUrl: null,
        thumbnailUrl: null,
        scale: 100,
        dimensions: dimensionsJson,
      },
    });
  }

  return NextResponse.json({ scan, floorPlan }, { status: 201 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { userId: true },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scans = await prisma.lidarScan.findMany({
    where: { inspectionId },
    include: { floorPlan: true },
    orderBy: { createdAt: "desc" },
  });

  const totalAreaSqm = scans
    .map((s) => {
      try {
        const d = JSON.parse(s.dimensions ?? "{}") as { area?: number };
        return d.area ?? 0;
      } catch {
        return 0;
      }
    })
    .reduce((a, b) => a + b, 0);

  return NextResponse.json({ inspectionId, scans, totalAreaSqm });
}
