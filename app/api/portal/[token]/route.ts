import { NextRequest, NextResponse } from "next/server";
import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const verified = verifyPortalToken(token);

    if (!verified) {
      return NextResponse.json({ error: "expired" }, { status: 401 });
    }

    const { inspectionId } = verified;

    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: {
          where: { isSelected: true },
        },
        report: {
          select: { status: true, id: true },
        },
      },
    });

    if (!inspection) {
      return NextResponse.json({ error: "expired" }, { status: 401 });
    }

    // Build safe moisture summary
    const readings = inspection.moistureReadings;
    const avgMoisture =
      readings.length > 0
        ? Math.round(
            readings.reduce((sum, r) => sum + r.moistureLevel, 0) /
              readings.length,
          )
        : null;

    const latestDate =
      readings.length > 0
        ? readings
            .map((r) => r.recordedAt)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null;

    // Public-safe payload — strip pricing, internal fields, notes
    const publicData = {
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      technicianName: inspection.technicianName,
      inspectionDate: inspection.createdAt,
      status: inspection.status,
      affectedAreas: inspection.affectedAreas.map((a) => ({
        id: a.id,
        roomZoneId: a.roomZoneId,
        category: a.category,
        class: a.class,
        affectedSquareFootage: a.affectedSquareFootage,
      })),
      scopeItems: inspection.scopeItems.map((s) => ({
        id: s.id,
        description: s.description,
        itemType: s.itemType,
      })),
      moistureSummary: {
        avgMoisture,
        latestDate,
        readingCount: readings.length,
      },
      reportReady: inspection.report?.status === "COMPLETED",
    };

    return NextResponse.json(publicData);
  } catch (error) {
    console.error("Portal token fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
