import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

/** GET — manager/tech drying overview (Wave 2). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const [moisture, psychrometric, environmental, psychWithEquipment] =
      await Promise.all([
        prisma.moistureReading.findMany({
          where: { inspectionId: id, invalidatedAt: null },
          orderBy: { recordedAt: "asc" },
          take: 200,
          select: {
            id: true,
            location: true,
            moistureLevel: true,
            recordedAt: true,
            isBaseline: true,
            isMonitoringPoint: true,
          },
        }),
        prisma.psychrometricReading.findMany({
          where: { inspectionId: id },
          orderBy: { visitDate: "asc" },
          take: 100,
          select: {
            id: true,
            visitDate: true,
            visitNumber: true,
            dryBulbTempC: true,
            relativeHumidity: true,
            dewPointC: true,
            equipmentRunning: true,
          },
        }),
        prisma.environmentalData.findMany({
          where: { inspectionId: id },
          orderBy: { recordedAt: "asc" },
          take: 50,
          select: {
            recordedAt: true,
            ambientTemperature: true,
            humidityLevel: true,
            dewPoint: true,
          },
        }),
        prisma.psychrometricReading.count({
          where: { inspectionId: id, equipmentRunning: true },
        }),
      ]);

    const latestMoisture = moisture.at(-1) ?? null;
    const latestPsych = psychrometric.at(-1) ?? null;
    const monitoringPoints = moisture.filter((m) => m.isMonitoringPoint).length;

    return NextResponse.json({
      data: {
        moistureSeries: moisture,
        psychrometricSeries: psychrometric,
        environmentalSeries: environmental,
        psychVisitsWithEquipmentRunning: psychWithEquipment,
        summary: {
          readingCount: moisture.length,
          monitoringPoints,
          latestMoistureLevel: latestMoisture?.moistureLevel ?? null,
          latestMoistureAt: latestMoisture?.recordedAt?.toISOString() ?? null,
          latestRh: latestPsych?.relativeHumidity ?? null,
          latestDewPoint: latestPsych?.dewPointC ?? null,
          latestDryBulbC: latestPsych?.dryBulbTempC ?? null,
          latestPsychAt: latestPsych?.visitDate?.toISOString() ?? null,
          psychVisitCount: psychrometric.length,
        },
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "drying-snapshot" });
  }
}