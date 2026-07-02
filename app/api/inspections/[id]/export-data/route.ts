import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import type { InspectionReportData } from "@/lib/pdf-export";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/inspections/[id]/export-data
// Assembles all inspection data required for client-side PDF export.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      include: {
        affectedAreas: {
          orderBy: { createdAt: "asc" },
          select: {
            roomZoneId: true,
            waterSource: true,
            category: true,
            affectedSquareFootage: true,
          },
        },
        moistureReadings: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            recordedAt: true,
            location: true,
            surfaceType: true,
            moistureLevel: true,
          },
        },
        scopeItems: {
          where: { isSelected: true },
          orderBy: { createdAt: "asc" },
          select: {
            description: true,
            quantity: true,
            unit: true,
            justification: true,
            itemType: true,
          },
        },
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            category: true,
            class: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const primaryClassification = inspection.classifications[0] ?? null;

    const payload: InspectionReportData = {
      inspection: {
        inspectionNumber: inspection.inspectionNumber,
        status: inspection.status,
        propertyAddress:
          `${inspection.propertyAddress} ${inspection.propertyPostcode}`.trim(),
        createdAt: inspection.createdAt.toISOString(),
        completedAt: null,
        technician: inspection.user?.name
          ? { name: inspection.user.name, licenceNumber: null }
          : inspection.technicianName
            ? { name: inspection.technicianName, licenceNumber: null }
            : null,
        damageCategory: primaryClassification?.category ?? null,
        damageClass: primaryClassification?.class ?? null,
        affectedAreaM2:
          inspection.affectedAreas.length > 0
            ? inspection.affectedAreas.reduce(
                (sum, a) => sum + a.affectedSquareFootage,
                0,
              )
            : null,
        notes: null,
      },
      areas: inspection.affectedAreas.map((a) => ({
        roomName: a.roomZoneId,
        material: a.waterSource,
        damageCategory: a.category ?? primaryClassification?.category ?? "—",
        areaM2: a.affectedSquareFootage,
      })),
      moistureReadings: inspection.moistureReadings.map((r) => ({
        readingDate: r.recordedAt.toISOString(),
        location: r.location,
        material: r.surfaceType,
        moistureContent: r.moistureLevel,
        status:
          r.moistureLevel < 15
            ? "Normal"
            : r.moistureLevel < 25
              ? "Elevated"
              : "High",
      })),
      scopeItems: inspection.scopeItems.map((s) => ({
        description: s.description,
        quantity: s.quantity,
        unit: s.unit,
        iicrcReference: s.justification,
        itemType: s.itemType,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return fromException(request, error, { stage: "inspection-export-data" });
  }
}
