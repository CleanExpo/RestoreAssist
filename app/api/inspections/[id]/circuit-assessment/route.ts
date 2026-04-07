/**
 * Circuit Assessment API — RA-261 Phase 1 (AS/NZS 3012:2019 Compliance)
 *
 * GET  /api/inspections/[id]/circuit-assessment
 *   Returns all circuit assessments for this inspection.
 *   Includes overall safety flag (all circuits safe?).
 *
 * POST /api/inspections/[id]/circuit-assessment
 *   Creates a new circuit assessment.
 *   Auto-calculates totalCircuitLoad, circuitLoadSafe, circuitLoadWarning.
 *
 * DELETE /api/inspections/[id]/circuit-assessment/[circuitId]
 *   Removes a specific circuit assessment.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ─── Equipment amp draw reference (IICRC S500 / AS/NZS 3012) ──────────────────

const TYPICAL_AMP_DRAWS: Record<string, number> = {
  AIR_MOVER: 2.0, // Conservative mid-range (0.6–4.5A)
  LGR_DEHU: 8.0, // Conservative (6.7–10A for 85–165 pint)
  DESICCANT_DEHU: 6.5, // Conservative (5.5–7.5A)
  AIR_SCRUBBER: 3.0, // Conservative (2.5–6A)
  NEGATIVE_AIR: 10.0, // Conservative (8–12A)
};

// ─── Validation ────────────────────────────────────────────────────────────────

const equipmentItemSchema = z.object({
  type: z.enum([
    "AIR_MOVER",
    "LGR_DEHU",
    "DESICCANT_DEHU",
    "AIR_SCRUBBER",
    "NEGATIVE_AIR",
  ]),
  model: z.string().optional().nullable(),
  serial: z.string().optional().nullable(),
  ampDraw: z.number().positive().optional().nullable(), // If null, uses typical reference
});

const circuitSchema = z.object({
  circuitId: z.string().min(1),
  locationZone: z.string().min(1),
  equipmentList: z.array(equipmentItemSchema),
  circuitBreakerRating: z
    .number()
    .int()
    .refine((v) => [10, 15, 20, 25, 32, 40, 50].includes(v), {
      message: "Must be a standard breaker rating: 10, 15, 20, 25, 32, 40, 50A",
    }),
  rcdProtected: z.boolean().default(false),
  extensionCordGauge: z.string().optional().nullable(),
});

// ─── Safety calculation ────────────────────────────────────────────────────────

function calculateCircuitSafety(
  equipmentList: z.infer<typeof equipmentItemSchema>[],
  circuitBreakerRating: number,
): {
  totalCircuitLoad: number;
  circuitLoadSafe: boolean;
  circuitLoadWarning: string | null;
} {
  const totalLoad = equipmentList.reduce((sum, eq) => {
    return sum + (eq.ampDraw ?? TYPICAL_AMP_DRAWS[eq.type] ?? 0);
  }, 0);

  const safeLimit = circuitBreakerRating * 0.8; // AS/NZS 3012:2019 80% rule
  const safe = totalLoad <= safeLimit;

  let warning: string | null = null;
  if (!safe) {
    const excess = (totalLoad - safeLimit).toFixed(1);
    warning = [
      `UNSAFE: Total circuit load ${totalLoad.toFixed(1)}A exceeds 80% of ${circuitBreakerRating}A breaker (limit: ${safeLimit.toFixed(1)}A).`,
      `Excess: ${excess}A. Remove ${excess}A of equipment or distribute to another circuit.`,
      `Reference: AS/NZS 3012:2019 §4.3 — continuous load must not exceed 80% of breaker rating.`,
    ].join(" ");
  } else if (totalLoad > safeLimit * 0.9) {
    warning = `WARNING: Load at ${Math.round((totalLoad / safeLimit) * 100)}% of safe limit (${totalLoad.toFixed(1)}A / ${safeLimit.toFixed(1)}A). Consider distributing equipment.`;
  }

  return {
    totalCircuitLoad: Math.round(totalLoad * 100) / 100,
    circuitLoadSafe: safe,
    circuitLoadWarning: warning,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const circuits = await prisma.circuitAssessment.findMany({
    where: { inspectionId: params.id },
    orderBy: { createdAt: "asc" },
  });

  const allSafe = circuits.every((c) => c.circuitLoadSafe !== false);
  const hasUnsafe = circuits.some((c) => c.circuitLoadSafe === false);

  return NextResponse.json({
    circuits,
    summary: {
      totalCircuits: circuits.length,
      allCircuitsSafe: allSafe && circuits.length > 0,
      hasUnsafeCircuits: hasUnsafe,
      rcdProtectedAll: circuits.every((c) => c.rcdProtected),
    },
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = circuitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const safety = calculateCircuitSafety(
    data.equipmentList,
    data.circuitBreakerRating,
  );

  const record = await prisma.circuitAssessment.create({
    data: {
      inspectionId: params.id,
      circuitId: data.circuitId,
      locationZone: data.locationZone,
      equipmentList: data.equipmentList,
      circuitBreakerRating: data.circuitBreakerRating,
      rcdProtected: data.rcdProtected,
      extensionCordGauge: data.extensionCordGauge ?? null,
      ...safety,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
