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
import { withIdempotency } from "@/lib/idempotency";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(_req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const { id } = await params;

    // RA-1711 batch 3 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const circuits = await prisma.circuitAssessment.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const allSafe = circuits.every((c) => c.circuitLoadSafe !== false);
    const hasUnsafe = circuits.some((c) => c.circuitLoadSafe === false);

    return NextResponse.json({
      circuits,
      summary: {
        totalCircuits: circuits.length,
        allCircuitsSafe: allSafe && circuits.length > 0,
        hasUnsafeCircuits: hasUnsafe,
        rcdProtectedAll: circuits.every((c: any) => c.rcdProtected),
      },
    });
  } catch (err) {
    return fromException(_req, err, { stage: "circuit-assessment:list" });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: prevents duplicate circuit-assessment rows on retry.
  return withIdempotency(req, userId, async (rawBody) => {
    try {
      // RA-1711 batch 3 — adopt shared tenancy helper.
      const tenancy = await assertInspectionTenancy(session, id);
      if (!tenancy.ok) {
        return NextResponse.json(
          { error: tenancy.reason },
          { status: tenancy.status },
        );
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(req, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
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
          inspectionId: id,
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
    } catch (err) {
      return fromException(req, err, { stage: "circuit-assessment:create" });
    }
  });
}
