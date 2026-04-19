/**
 * Psychrometric Readings API — RA-261 Phase 1
 *
 * GET  /api/inspections/[id]/psychrometric
 *   Returns all daily psychrometric readings, sorted by visitNumber ASC.
 *   Includes drying progress summary (trend toward 30-35 GPP target).
 *
 * POST /api/inspections/[id]/psychrometric
 *   Records a new daily psychrometric reading.
 *   Auto-calculates dewPoint from dryBulbTemp + relativeHumidity if not supplied.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withIdempotency } from "@/lib/idempotency";

// ─── Dew point calculation ─────────────────────────────────────────────────────

/**
 * Magnus formula dew point approximation.
 * Accurate to ±0.5°C in the 0–60°C range.
 */
function calculateDewPoint(dryBulbC: number, relativeHumidity: number): number {
  const a = 17.27;
  const b = 237.7;
  const alpha =
    (a * dryBulbC) / (b + dryBulbC) + Math.log(relativeHumidity / 100);
  return (b * alpha) / (a - alpha);
}

// ─── Validation ────────────────────────────────────────────────────────────────

const readingSchema = z.object({
  visitDate: z.string().datetime(),
  visitNumber: z.number().int().positive(),
  technicianId: z.string().optional().nullable(),
  dryBulbTempC: z.number().optional().nullable(),
  wetBulbTempC: z.number().optional().nullable(),
  relativeHumidity: z.number().min(0).max(100).optional().nullable(),
  dewPointC: z.number().optional().nullable(), // auto-calculated if omitted
  grainsPerPound: z.number().optional().nullable(),
  gramsPerKilogram: z.number().optional().nullable(),
  equipmentRunning: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const readings = await (prisma as any).psychrometricReading.findMany({
    where: { inspectionId: id },
    orderBy: { visitNumber: "asc" },
  });

  // Compute drying trend summary
  const gppReadings = readings.filter((r: any) => r.grainsPerPound != null);
  const summary = {
    totalVisits: readings.length,
    latestGPP: gppReadings.at(-1)?.grainsPerPound ?? null,
    initialGPP: gppReadings[0]?.grainsPerPound ?? null,
    targetGPP: 35, // IICRC S500 drying goal
    dryingGoalAchieved:
      gppReadings.length > 0 &&
      (gppReadings.at(-1)?.grainsPerPound ?? 999) <= 35,
    latestRH: readings.at(-1)?.relativeHumidity ?? null,
  };

  return NextResponse.json({ readings, summary });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: psychrometric readings are time-series — retry creates
  // duplicate data points.
  return withIdempotency(req, userId, async (rawBody) => {
    const inspection = await prisma.inspection.findUnique({
      where: { id, userId },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = readingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Auto-calculate dew point if not provided
    let dewPointC = data.dewPointC ?? null;
    if (
      dewPointC == null &&
      data.dryBulbTempC != null &&
      data.relativeHumidity != null
    ) {
      dewPointC =
        Math.round(
          calculateDewPoint(data.dryBulbTempC, data.relativeHumidity) * 10,
        ) / 10;
    }

    const record = await (prisma as any).psychrometricReading.create({
      data: {
        inspectionId: id,
        visitDate: new Date(data.visitDate),
        visitNumber: data.visitNumber,
        technicianId: data.technicianId ?? null,
        dryBulbTempC: data.dryBulbTempC ?? null,
        wetBulbTempC: data.wetBulbTempC ?? null,
        relativeHumidity: data.relativeHumidity ?? null,
        dewPointC,
        grainsPerPound: data.grainsPerPound ?? null,
        gramsPerKilogram: data.gramsPerKilogram ?? null,
        equipmentRunning: data.equipmentRunning,
        notes: data.notes ?? null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  });
}
