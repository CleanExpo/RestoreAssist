import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { withIdempotency } from "@/lib/idempotency";

// POST - Add or update environmental data
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: EnvironmentalData is a time-series (M-7) — each POST creates
  // a new reading row. Retry would create duplicate readings for the same
  // timestamp, which pollutes the drying-trend chart.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
      });

      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
        );
      }

      if (body.ambientTemperature !== undefined) {
        if (body.ambientTemperature < -20 || body.ambientTemperature > 130) {
          return NextResponse.json(
            { error: "Temperature must be between -20°F and 130°F" },
            { status: 400 },
          );
        }
      }

      if (body.humidityLevel !== undefined) {
        if (body.humidityLevel < 0 || body.humidityLevel > 100) {
          return NextResponse.json(
            { error: "Humidity must be between 0% and 100%" },
            { status: 400 },
          );
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
      console.error("Error saving environmental data:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
