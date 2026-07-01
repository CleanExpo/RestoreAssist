import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// POST - Add or update environmental data
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  let inspection;
  try {
    inspection = await prisma.inspection.findFirst({
      where: { id, userId },
      select: { id: true, workspaceId: true },
    });
  } catch (error) {
    return fromException(request, error, { stage: "environmental-lookup" });
  }

  if (!inspection) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }

  // RA-1266: EnvironmentalData is a time-series (M-7) — each POST creates
  // a new reading row. Retry would create duplicate readings for the same
  // timestamp, which pollutes the drying-trend chart.
  return withIdempotency(
    request,
    userId,
    async (rawBody) => {
      try {
        let body: any;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return apiError(request, {
            code: "VALIDATION",
            message: "Invalid JSON body",
            status: 400,
          });
        }

        if (body.ambientTemperature !== undefined) {
          if (body.ambientTemperature < -20 || body.ambientTemperature > 55) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Temperature must be between -20°C and 55°C",
              status: 400,
            });
          }
        }

        if (body.humidityLevel !== undefined) {
          if (body.humidityLevel < 0 || body.humidityLevel > 100) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Humidity must be between 0% and 100%",
              status: 400,
            });
          }
        }

        const sanitizedNotes = body.notes
          ? sanitizeString(body.notes, 2000)
          : null;
        const sanitizedWeather = body.weatherConditions
          ? sanitizeString(body.weatherConditions, 200)
          : null;

        const environmentalData = await prisma.environmentalData.create({
          data: {
            inspectionId: id,
            ambientTemperature: body.ambientTemperature,
            humidityLevel: body.humidityLevel,
            dewPoint: body.dewPoint,
            airCirculation: body.airCirculation ?? false,
            weatherConditions: sanitizedWeather,
            notes: sanitizedNotes,
          },
        });

        await prisma.auditLog.create({
          data: {
            inspectionId: id,
            action: "Environmental data added/updated",
            entityType: "EnvironmentalData",
            entityId: environmentalData.id,
            userId,
            changes: JSON.stringify({
              ambientTemperature: environmentalData.ambientTemperature,
              humidityLevel: environmentalData.humidityLevel,
              dewPoint: environmentalData.dewPoint,
              airCirculation: environmentalData.airCirculation,
              weatherConditions: environmentalData.weatherConditions,
              notes: environmentalData.notes,
            }),
          },
        });

        return NextResponse.json({ environmentalData });
      } catch (error) {
        return fromException(request, error, { stage: "save" });
      }
    },
    inspection.workspaceId
      ? {
          clientMutation: {
            workspaceId: inspection.workspaceId,
            userId,
            inspectionId: id,
            mutationType: "environmental-data",
          },
        }
      : undefined,
  );
}
