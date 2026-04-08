/**
 * Mould Remediation Assessment API — RA-290 (NIR Phase 3)
 *
 * GET  /api/inspections/[id]/mould-remediation
 *   Returns the current MouldRemediationAssessment (or null).
 *
 * POST /api/inspections/[id]/mould-remediation
 *   Upserts the record. Stamps Inspection.claimType = MOULD.
 *   Recomputes gate fields:
 *     gateMoistureSourceFixed      = moistureSourceIdentified && rootCauseAddressed
 *     gateContainmentSufficient    = pressureDifferentialPa != null && airChangesPerHour != null
 *
 * DELETE /api/inspections/[id]/mould-remediation
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ─── Validation ────────────────────────────────────────────────────────────────

const mouldSchema = z.object({
  mouldConditionLevel: z
    .enum(["CONDITION_1", "CONDITION_2", "CONDITION_3"])
    .nullable()
    .optional(),
  visibleGrowthObserved: z.boolean().optional(),
  affectedAreaM2: z.number().nonnegative().nullable().optional(),
  moistureSourceIdentified: z.boolean().optional(),
  rootCauseAddressed: z.boolean().optional(),
  pressureDifferentialPa: z.number().nullable().optional(),
  airChangesPerHour: z.number().positive().nullable().optional(),
  containmentBarrierMaterial: z.string().nullable().optional(),
  negativePressureMachineModel: z.string().nullable().optional(),
  airSamplingRequired: z.boolean().optional(),
  samplingDate: z.string().datetime().nullable().optional(),
  labName: z.string().nullable().optional(),
  labReportReference: z.string().nullable().optional(),
  sporeType: z.string().nullable().optional(),
  sporeCountPreRemediation: z.number().nonnegative().nullable().optional(),
  outdoorBaselineCount: z.number().nonnegative().nullable().optional(),
  sporeCountPostRemediation: z.number().nonnegative().nullable().optional(),
  clearanceCriterion: z.string().nullable().optional(),
  iepAssessmentRequired: z.boolean().optional(),
});

// ─── Gate computation ──────────────────────────────────────────────────────────

function computeGates(data: z.infer<typeof mouldSchema>) {
  return {
    gateMoistureSourceFixed:
      data.moistureSourceIdentified === true &&
      data.rootCauseAddressed === true,
    gateContainmentSufficient:
      data.pressureDifferentialPa != null && data.airChangesPerHour != null,
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

  const inspection = await (prisma as any).inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, mouldRemediationAssessment: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    (inspection as any).mouldRemediationAssessment ?? null,
  );
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
  const parsed = mouldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const gates = computeGates(data);

  const [record] = await (prisma as any).$transaction([
    (prisma as any).mouldRemediationAssessment.upsert({
      where: { inspectionId: params.id },
      create: {
        inspectionId: params.id,
        mouldConditionLevel: data.mouldConditionLevel ?? undefined,
        visibleGrowthObserved: data.visibleGrowthObserved ?? false,
        affectedAreaM2: data.affectedAreaM2 ?? undefined,
        moistureSourceIdentified: data.moistureSourceIdentified ?? false,
        rootCauseAddressed: data.rootCauseAddressed ?? false,
        pressureDifferentialPa: data.pressureDifferentialPa ?? undefined,
        airChangesPerHour: data.airChangesPerHour ?? undefined,
        containmentBarrierMaterial:
          data.containmentBarrierMaterial ?? undefined,
        negativePressureMachineModel:
          data.negativePressureMachineModel ?? undefined,
        airSamplingRequired: data.airSamplingRequired ?? false,
        samplingDate: data.samplingDate
          ? new Date(data.samplingDate)
          : undefined,
        labName: data.labName ?? undefined,
        labReportReference: data.labReportReference ?? undefined,
        sporeType: data.sporeType ?? undefined,
        sporeCountPreRemediation: data.sporeCountPreRemediation ?? undefined,
        outdoorBaselineCount: data.outdoorBaselineCount ?? undefined,
        sporeCountPostRemediation: data.sporeCountPostRemediation ?? undefined,
        clearanceCriterion: data.clearanceCriterion ?? undefined,
        iepAssessmentRequired: data.iepAssessmentRequired ?? false,
        ...gates,
      },
      update: {
        ...(data.mouldConditionLevel !== undefined && {
          mouldConditionLevel: data.mouldConditionLevel,
        }),
        ...(data.visibleGrowthObserved !== undefined && {
          visibleGrowthObserved: data.visibleGrowthObserved,
        }),
        ...(data.affectedAreaM2 !== undefined && {
          affectedAreaM2: data.affectedAreaM2,
        }),
        ...(data.moistureSourceIdentified !== undefined && {
          moistureSourceIdentified: data.moistureSourceIdentified,
        }),
        ...(data.rootCauseAddressed !== undefined && {
          rootCauseAddressed: data.rootCauseAddressed,
        }),
        ...(data.pressureDifferentialPa !== undefined && {
          pressureDifferentialPa: data.pressureDifferentialPa,
        }),
        ...(data.airChangesPerHour !== undefined && {
          airChangesPerHour: data.airChangesPerHour,
        }),
        ...(data.containmentBarrierMaterial !== undefined && {
          containmentBarrierMaterial: data.containmentBarrierMaterial,
        }),
        ...(data.negativePressureMachineModel !== undefined && {
          negativePressureMachineModel: data.negativePressureMachineModel,
        }),
        ...(data.airSamplingRequired !== undefined && {
          airSamplingRequired: data.airSamplingRequired,
        }),
        ...(data.samplingDate !== undefined && {
          samplingDate: data.samplingDate ? new Date(data.samplingDate) : null,
        }),
        ...(data.labName !== undefined && { labName: data.labName }),
        ...(data.labReportReference !== undefined && {
          labReportReference: data.labReportReference,
        }),
        ...(data.sporeType !== undefined && { sporeType: data.sporeType }),
        ...(data.sporeCountPreRemediation !== undefined && {
          sporeCountPreRemediation: data.sporeCountPreRemediation,
        }),
        ...(data.outdoorBaselineCount !== undefined && {
          outdoorBaselineCount: data.outdoorBaselineCount,
        }),
        ...(data.sporeCountPostRemediation !== undefined && {
          sporeCountPostRemediation: data.sporeCountPostRemediation,
        }),
        ...(data.clearanceCriterion !== undefined && {
          clearanceCriterion: data.clearanceCriterion,
        }),
        ...(data.iepAssessmentRequired !== undefined && {
          iepAssessmentRequired: data.iepAssessmentRequired,
        }),
        ...gates,
      },
    }),
    prisma.inspection.update({
      where: { id: params.id },
      data: { claimType: "MOULD" } as any,
    }),
  ]);

  return NextResponse.json(record);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
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

  await (prisma as any).$transaction([
    (prisma as any).mouldRemediationAssessment.deleteMany({
      where: { inspectionId: params.id },
    }),
    prisma.inspection.update({
      where: { id: params.id },
      data: { claimType: null } as any,
    }),
  ]);

  return NextResponse.json({ deleted: true });
}
