import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";

// POST - Add or update environmental data
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
    const body = await request.json();

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Validate data ranges
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

    // Sanitize free-text fields — cap length and strip HTML/XSS vectors.
    // notes/weatherConditions are included in the audit log; unbounded strings
    // can bloat WAL and be used for stored XSS if rendered unescaped.
    const sanitizedNotes = body.notes ? sanitizeString(body.notes, 2000) : null;
    const sanitizedWeather = body.weatherConditions
      ? sanitizeString(body.weatherConditions, 200)
      : null;

    // RA-1383 (Board M-7 item 4): EnvironmentalData is now a time-series.
    // Each POST creates a new reading; the per-inspection singleton upsert
    // pattern is no longer correct (Ops Director §3 requires one reading per
    // chamber per 24h).
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

    // Audit log: use an explicit allowlist — never serialise the raw request body.
    // Dumping body verbatim injects attacker-controlled content into the audit trail
    // and can feed stored prompt injection into AI summarisation pipelines.
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Environmental data added/updated",
        entityType: "EnvironmentalData",
        entityId: environmentalData.id,
        userId: session.user.id,
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
}
