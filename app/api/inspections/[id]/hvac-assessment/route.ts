/**
 * HVAC Assessment API — RA-290 (NIR Phase 5)
 *
 * GET  /api/inspections/[id]/hvac-assessment
 *   Returns the current HVACAssessment (or null).
 *
 * POST /api/inspections/[id]/hvac-assessment
 *   Upserts the record. Stamps Inspection.claimType = HVAC.
 *
 * DELETE /api/inspections/[id]/hvac-assessment
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
import { apiError } from "@/lib/api-errors";

// ─── Validation ────────────────────────────────────────────────────────────────

const hvacSchema = z.object({
  hvacSystemInspected: z.boolean().optional(),
  ductContaminationLevel: z
    .enum(["NONE", "LIGHT", "MODERATE", "HEAVY"])
    .nullable()
    .optional(),
  visibleSootInDucts: z.boolean().optional(),
  smokeOdourInDucts: z.boolean().optional(),
  filterCondition: z.string().nullable().optional(),
  coilContaminationLevel: z
    .enum(["NONE", "LIGHT", "MODERATE", "HEAVY"])
    .nullable()
    .optional(),
  hvacCleaningRequired: z.boolean().optional(),
  insulationResistanceMegaohm: z.number().nonnegative().nullable().optional(),
  insulationTestPerformedBy: z.string().nullable().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
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
    select: { hvacAssessment: true },
  });

  return NextResponse.json(inspection?.hvacAssessment ?? null);
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

  const { id } = await params;

  const tenancy = await resolveInspectionWrite(session, id);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  const body = await req.json();
  const parsed = hvacSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const record = await prisma.hVACAssessment.upsert({
    where: { inspectionId: id },
    create: {
      inspectionId: id,
      hvacSystemInspected: data.hvacSystemInspected ?? false,
      ductContaminationLevel: data.ductContaminationLevel ?? undefined,
      visibleSootInDucts: data.visibleSootInDucts ?? false,
      smokeOdourInDucts: data.smokeOdourInDucts ?? false,
      filterCondition: data.filterCondition ?? undefined,
      coilContaminationLevel: data.coilContaminationLevel ?? undefined,
      hvacCleaningRequired: data.hvacCleaningRequired ?? false,
      insulationResistanceMegaohm:
        data.insulationResistanceMegaohm ?? undefined,
      insulationTestPerformedBy: data.insulationTestPerformedBy ?? undefined,
    },
    update: {
      ...(data.hvacSystemInspected !== undefined && {
        hvacSystemInspected: data.hvacSystemInspected,
      }),
      ...(data.ductContaminationLevel !== undefined && {
        ductContaminationLevel: data.ductContaminationLevel,
      }),
      ...(data.visibleSootInDucts !== undefined && {
        visibleSootInDucts: data.visibleSootInDucts,
      }),
      ...(data.smokeOdourInDucts !== undefined && {
        smokeOdourInDucts: data.smokeOdourInDucts,
      }),
      ...(data.filterCondition !== undefined && {
        filterCondition: data.filterCondition,
      }),
      ...(data.coilContaminationLevel !== undefined && {
        coilContaminationLevel: data.coilContaminationLevel,
      }),
      ...(data.hvacCleaningRequired !== undefined && {
        hvacCleaningRequired: data.hvacCleaningRequired,
      }),
      ...(data.insulationResistanceMegaohm !== undefined && {
        insulationResistanceMegaohm: data.insulationResistanceMegaohm,
      }),
      ...(data.insulationTestPerformedBy !== undefined && {
        insulationTestPerformedBy: data.insulationTestPerformedBy,
      }),
    },
  });

  await prisma.inspection.update({
    where: tenancy.data.inspectionWhere,
    data: { claimType: "HVAC" },
  });

  return NextResponse.json(record);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
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
      prisma.hVACAssessment.delete({
        where: {
          inspectionId: id,
          ...(tenancy.data.childInspectionFilter && {
            inspection: tenancy.data.childInspectionFilter,
          }),
        },
      }),
    {
      route: "/api/inspections/[id]/hvac-assessment",
      stage: "delete",
      inspectionId: id,
    },
  );

  await prisma.inspection.update({
    where: tenancy.data.inspectionWhere,
    data: { claimType: null },
  });

  return NextResponse.json({ deleted: true });
}
