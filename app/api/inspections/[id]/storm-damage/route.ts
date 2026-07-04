/**
 * Storm Damage Assessment API — RA-290 (NIR Phase 4)
 *
 * GET  /api/inspections/[id]/storm-damage
 *   Returns the current StormDamageAssessment (or null).
 *
 * POST /api/inspections/[id]/storm-damage
 *   Upserts the record. Stamps Inspection.claimType = STORM.
 *
 * DELETE /api/inspections/[id]/storm-damage
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { softDelete } from "@/lib/prisma-helpers";
import { z } from "zod";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// ─── Validation ────────────────────────────────────────────────────────────────

const stormSchema = z.object({
  bomEventReference: z.string().nullable().optional(),
  windSpeedKmh: z.number().nonnegative().nullable().optional(),
  eventType: z
    .enum(["STORM", "CYCLONE", "HAIL", "DOWNBURST", "TORNADO"])
    .nullable()
    .optional(),
  eventTimestamp: z.string().datetime().nullable().optional(),
  roofMaterialType: z
    .enum(["COLORBOND", "TERRACOTTA", "SHINGLES", "METAL", "OTHER"])
    .nullable()
    .optional(),
  roofDamageAreaM2: z.number().nonnegative().nullable().optional(),
  damagePenetration: z
    .enum(["SURFACE", "PARTIAL", "FULL"])
    .nullable()
    .optional(),
  waterIngressPoints: z.string().nullable().optional(),
  engineerClearanceRequired: z.boolean().optional(),
  emergencyTarpingCompleted: z.boolean().optional(),
  emergencyTarpingM2: z.number().nonnegative().nullable().optional(),
  emergencyTarpingTimestamp: z.string().datetime().nullable().optional(),
  waterCategory: z.enum(["CAT_1", "CAT_2", "CAT_3"]).nullable().optional(),
  asbestosRiskFlag: z.boolean().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // RA-1711 batch 2 — shared tenancy helper (workspace-member + admin paths).
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { stormDamageAssessment: true },
    });

    return NextResponse.json(inspection?.stormDamageAssessment ?? null);
  } catch (err) {
    return fromException(req, err, { stage: "storm-damage:get" });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = stormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const record = await prisma.stormDamageAssessment.upsert({
      where: { inspectionId: id },
      create: {
        inspectionId: id,
        bomEventReference: data.bomEventReference ?? undefined,
        windSpeedKmh: data.windSpeedKmh ?? undefined,
        eventType: data.eventType ?? undefined,
        eventTimestamp: data.eventTimestamp
          ? new Date(data.eventTimestamp)
          : undefined,
        roofMaterialType: data.roofMaterialType ?? undefined,
        roofDamageAreaM2: data.roofDamageAreaM2 ?? undefined,
        damagePenetration: data.damagePenetration ?? undefined,
        waterIngressPoints: data.waterIngressPoints ?? undefined,
        engineerClearanceRequired: data.engineerClearanceRequired ?? false,
        emergencyTarpingCompleted: data.emergencyTarpingCompleted ?? false,
        emergencyTarpingM2: data.emergencyTarpingM2 ?? undefined,
        emergencyTarpingTimestamp: data.emergencyTarpingTimestamp
          ? new Date(data.emergencyTarpingTimestamp)
          : undefined,
        waterCategory: data.waterCategory ?? undefined,
        asbestosRiskFlag: data.asbestosRiskFlag ?? false,
      },
      update: {
        ...(data.bomEventReference !== undefined && {
          bomEventReference: data.bomEventReference,
        }),
        ...(data.windSpeedKmh !== undefined && {
          windSpeedKmh: data.windSpeedKmh,
        }),
        ...(data.eventType !== undefined && { eventType: data.eventType }),
        ...(data.eventTimestamp !== undefined && {
          eventTimestamp: data.eventTimestamp
            ? new Date(data.eventTimestamp)
            : null,
        }),
        ...(data.roofMaterialType !== undefined && {
          roofMaterialType: data.roofMaterialType,
        }),
        ...(data.roofDamageAreaM2 !== undefined && {
          roofDamageAreaM2: data.roofDamageAreaM2,
        }),
        ...(data.damagePenetration !== undefined && {
          damagePenetration: data.damagePenetration,
        }),
        ...(data.waterIngressPoints !== undefined && {
          waterIngressPoints: data.waterIngressPoints,
        }),
        ...(data.engineerClearanceRequired !== undefined && {
          engineerClearanceRequired: data.engineerClearanceRequired,
        }),
        ...(data.emergencyTarpingCompleted !== undefined && {
          emergencyTarpingCompleted: data.emergencyTarpingCompleted,
        }),
        ...(data.emergencyTarpingM2 !== undefined && {
          emergencyTarpingM2: data.emergencyTarpingM2,
        }),
        ...(data.emergencyTarpingTimestamp !== undefined && {
          emergencyTarpingTimestamp: data.emergencyTarpingTimestamp
            ? new Date(data.emergencyTarpingTimestamp)
            : null,
        }),
        ...(data.waterCategory !== undefined && {
          waterCategory: data.waterCategory,
        }),
        ...(data.asbestosRiskFlag !== undefined && {
          asbestosRiskFlag: data.asbestosRiskFlag,
        }),
      },
    });

    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data: { claimType: "STORM" },
    });

    return NextResponse.json(record);
  } catch (err) {
    return fromException(req, err, { stage: "storm-damage:post" });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    await softDelete(
      () =>
        prisma.stormDamageAssessment.delete({
          where: {
            inspectionId: id,
            ...(tenancy.data.childInspectionFilter && {
              inspection: tenancy.data.childInspectionFilter,
            }),
          },
        }),
      {
        route: "/api/inspections/[id]/storm-damage",
        stage: "delete",
        inspectionId: id,
      },
    );

    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data: { claimType: null },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fromException(req, err, { stage: "storm-damage:delete" });
  }
}
