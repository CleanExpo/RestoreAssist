import { NextRequest, NextResponse } from "next/server";
import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

const MAX_PORTAL_AFFECTED_AREAS = 100;
const MAX_PORTAL_SCOPE_ITEMS = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-token",
    });
    if (rateLimited) return rateLimited;

    const { token } = await params;
    const verified = verifyPortalToken(token);

    if (!verified) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "expired",
        status: 401,
      });
    }

    const { inspectionId } = verified;

    const [
      inspection,
      moistureCount,
      moistureAverage,
      latestMoisture,
      affectedAreaCount,
      scopeItemCount,
    ] = await Promise.all([
      prisma.inspection.findUnique({
        where: { id: inspectionId },
        include: {
          affectedAreas: {
            orderBy: { createdAt: "asc" },
            take: MAX_PORTAL_AFFECTED_AREAS,
          },
          scopeItems: {
            where: { isSelected: true },
            orderBy: { createdAt: "asc" },
            take: MAX_PORTAL_SCOPE_ITEMS,
          },
          report: {
            select: { status: true, id: true },
          },
        },
      }),
      prisma.moistureReading.count({ where: { inspectionId } }),
      prisma.moistureReading.aggregate({
        where: { inspectionId },
        _avg: { moistureLevel: true },
      }),
      prisma.moistureReading.findFirst({
        where: { inspectionId },
        orderBy: { recordedAt: "desc" },
        select: { recordedAt: true },
      }),
      prisma.affectedArea.count({ where: { inspectionId } }),
      prisma.scopeItem.count({
        where: { inspectionId, isSelected: true },
      }),
    ]);

    if (!inspection) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "expired",
        status: 401,
      });
    }

    const avgMoisture =
      moistureAverage._avg.moistureLevel !== null
        ? Math.round(moistureAverage._avg.moistureLevel)
        : null;

    const latestDate = latestMoisture?.recordedAt ?? null;

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
        affectedAreaSqm: a.affectedAreaSqm,
        affectedSquareFootage: a.affectedSquareFootage,
      })),
      scopeItems: inspection.scopeItems.map((s) => ({
        id: s.id,
        description: s.description,
        itemType: s.itemType,
      })),
      limits: {
        affectedAreasReturned: inspection.affectedAreas.length,
        affectedAreasTotal: affectedAreaCount,
        affectedAreasTruncated:
          affectedAreaCount > MAX_PORTAL_AFFECTED_AREAS,
        scopeItemsReturned: inspection.scopeItems.length,
        scopeItemsTotal: scopeItemCount,
        scopeItemsTruncated: scopeItemCount > MAX_PORTAL_SCOPE_ITEMS,
      },
      moistureSummary: {
        avgMoisture,
        latestDate,
        readingCount: moistureCount,
      },
      reportReady: inspection.report?.status === "COMPLETED",
    };

    return NextResponse.json(publicData);
  } catch (error) {
    console.error("Portal token fetch error:", error);
    return fromException(request, error, { stage: "portal/token:get" });
  }
}
