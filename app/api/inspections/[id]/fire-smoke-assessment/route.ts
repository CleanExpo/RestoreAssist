/**
 * Fire & Smoke Damage Assessment API — RA-290 (NIR Phase 2)
 *
 * GET  /api/inspections/[id]/fire-smoke-assessment
 *   Returns the current FireSmokeDamageAssessment (or null).
 *
 * POST /api/inspections/[id]/fire-smoke-assessment
 *   Upserts the record. Stamps Inspection.claimType = FIRE.
 *   Recomputes gate fields:
 *     gateStructuralCleared  = structuralStability === 'SAFE'
 *     gateElectricalCleared  = electricalDisconnectVerified && gasShutoffVerified
 *
 * DELETE /api/inspections/[id]/fire-smoke-assessment
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

function tenancyCode(
  status: 401 | 403 | 404,
): "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  return "NOT_FOUND";
}

// ─── Validation ────────────────────────────────────────────────────────────────

const fireSchema = z.object({
  structuralStability: z
    .enum(["SAFE", "UNCERTAIN", "COMPROMISED"])
    .nullable()
    .optional(),
  electricalDisconnectVerified: z.boolean().optional(),
  gasShutoffVerified: z.boolean().optional(),
  charringDepthMm: z.number().nonnegative().nullable().optional(),
  engineerClearanceRequired: z.boolean().optional(),
  smokeResidueType: z
    .enum(["WET", "DRY", "PROTEIN", "FUEL_OIL"])
    .nullable()
    .optional(),
  residueLocation: z.string().nullable().optional(),
  surfacePH: z.number().min(0).max(14).nullable().optional(),
  pHMeterModel: z.string().nullable().optional(),
  odourSeverityScore: z.number().int().min(0).max(10).nullable().optional(),
  hvacAffected: z.boolean().optional(),
  odourType: z
    .enum(["SMOKE", "PROTEIN", "CHEMICAL", "FUEL"])
    .nullable()
    .optional(),
  ozoneTreatmentDuration: z.number().nonnegative().nullable().optional(),
  ozoneConcentrationPpm: z.number().nonnegative().nullable().optional(),
  evacuationOrderTimestamp: z.string().datetime().nullable().optional(),
  reentryApprovalTimestamp: z.string().datetime().nullable().optional(),
  spaceVolumeM3: z.number().positive().nullable().optional(),
});

// ─── Gate computation ──────────────────────────────────────────────────────────

function computeGates(data: z.infer<typeof fireSchema>) {
  return {
    gateStructuralCleared: data.structuralStability === "SAFE",
    gateElectricalCleared:
      data.electricalDisconnectVerified === true &&
      data.gasShutoffVerified === true,
  };
}

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
      return apiError(req, {
        code: tenancyCode(tenancy.status),
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { fireSmokeDamageAssessment: true },
    });

    return NextResponse.json(inspection?.fireSmokeDamageAssessment ?? null);
  } catch (err) {
    return fromException(req, err, { stage: "fire-smoke-assessment:get" });
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
      return apiError(req, {
        code: tenancyCode(tenancy.status),
        message: tenancy.reason,
        status: tenancy.status,
      });
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

    const parsed = fireSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const gates = computeGates(data);

    const record = await prisma.fireSmokeDamageAssessment.upsert({
      where: { inspectionId: id },
      create: {
        inspectionId: id,
        structuralStability: data.structuralStability ?? undefined,
        electricalDisconnectVerified:
          data.electricalDisconnectVerified ?? false,
        gasShutoffVerified: data.gasShutoffVerified ?? false,
        charringDepthMm: data.charringDepthMm ?? undefined,
        engineerClearanceRequired: data.engineerClearanceRequired ?? false,
        smokeResidueType: data.smokeResidueType ?? undefined,
        residueLocation: data.residueLocation ?? undefined,
        surfacePH: data.surfacePH ?? undefined,
        pHMeterModel: data.pHMeterModel ?? undefined,
        odourSeverityScore: data.odourSeverityScore ?? undefined,
        hvacAffected: data.hvacAffected ?? false,
        odourType: data.odourType ?? undefined,
        ozoneTreatmentDuration: data.ozoneTreatmentDuration ?? undefined,
        ozoneConcentrationPpm: data.ozoneConcentrationPpm ?? undefined,
        evacuationOrderTimestamp: data.evacuationOrderTimestamp
          ? new Date(data.evacuationOrderTimestamp)
          : undefined,
        reentryApprovalTimestamp: data.reentryApprovalTimestamp
          ? new Date(data.reentryApprovalTimestamp)
          : undefined,
        spaceVolumeM3: data.spaceVolumeM3 ?? undefined,
        ...gates,
      },
      update: {
        ...(data.structuralStability !== undefined && {
          structuralStability: data.structuralStability,
        }),
        ...(data.electricalDisconnectVerified !== undefined && {
          electricalDisconnectVerified: data.electricalDisconnectVerified,
        }),
        ...(data.gasShutoffVerified !== undefined && {
          gasShutoffVerified: data.gasShutoffVerified,
        }),
        ...(data.charringDepthMm !== undefined && {
          charringDepthMm: data.charringDepthMm,
        }),
        ...(data.engineerClearanceRequired !== undefined && {
          engineerClearanceRequired: data.engineerClearanceRequired,
        }),
        ...(data.smokeResidueType !== undefined && {
          smokeResidueType: data.smokeResidueType,
        }),
        ...(data.residueLocation !== undefined && {
          residueLocation: data.residueLocation,
        }),
        ...(data.surfacePH !== undefined && { surfacePH: data.surfacePH }),
        ...(data.pHMeterModel !== undefined && {
          pHMeterModel: data.pHMeterModel,
        }),
        ...(data.odourSeverityScore !== undefined && {
          odourSeverityScore: data.odourSeverityScore,
        }),
        ...(data.hvacAffected !== undefined && {
          hvacAffected: data.hvacAffected,
        }),
        ...(data.odourType !== undefined && { odourType: data.odourType }),
        ...(data.ozoneTreatmentDuration !== undefined && {
          ozoneTreatmentDuration: data.ozoneTreatmentDuration,
        }),
        ...(data.ozoneConcentrationPpm !== undefined && {
          ozoneConcentrationPpm: data.ozoneConcentrationPpm,
        }),
        ...(data.evacuationOrderTimestamp !== undefined && {
          evacuationOrderTimestamp: data.evacuationOrderTimestamp
            ? new Date(data.evacuationOrderTimestamp)
            : null,
        }),
        ...(data.reentryApprovalTimestamp !== undefined && {
          reentryApprovalTimestamp: data.reentryApprovalTimestamp
            ? new Date(data.reentryApprovalTimestamp)
            : null,
        }),
        ...(data.spaceVolumeM3 !== undefined && {
          spaceVolumeM3: data.spaceVolumeM3,
        }),
        ...gates,
      },
    });

    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data: { claimType: "FIRE" },
    });

    return NextResponse.json(record);
  } catch (err) {
    return fromException(req, err, { stage: "fire-smoke-assessment:post" });
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
      return apiError(req, {
        code: tenancyCode(tenancy.status),
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    await softDelete(
      () =>
        prisma.fireSmokeDamageAssessment.delete({
          where: {
            inspectionId: id,
            ...(tenancy.data.childInspectionFilter && {
              inspection: tenancy.data.childInspectionFilter,
            }),
          },
        }),
      {
        route: "/api/inspections/[id]/fire-smoke-assessment",
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
    return fromException(req, err, { stage: "fire-smoke-assessment:delete" });
  }
}
