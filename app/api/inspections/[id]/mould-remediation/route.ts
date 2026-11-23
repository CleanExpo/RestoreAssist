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
import {
  assertInspectionReadable,
  assertInspectionAssignedWrite,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

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
  // RA-7687: the row version (updatedAt) the form was loaded from; null when
  // the form loaded no record. See the compare-and-set in POST.
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});

/** Raised inside the POST transaction when the row moved since the form loaded. */
class StaleAssessmentError extends Error {}

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // RA-1711 batch 2 — shared tenancy helper (workspace-member + admin paths).
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { mouldRemediationAssessment: true },
    });

    return NextResponse.json(inspection?.mouldRemediationAssessment ?? null);
  } catch (err) {
    return fromException(_req, err, { stage: "mould-remediation:get" });
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

    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
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

    // RA-7687: the third-party report confirm route also writes the lab
    // columns of this row. A Save built from a form loaded before a confirm
    // would write its old values back over the confirmed ones, silently. The
    // Save therefore names the row version it loaded (expectedUpdatedAt) and
    // the write is a compare-and-set on it: a row that moved since, or a Save
    // that names no version for an existing row, is refused with 409 and
    // nothing is written. Postgres keeps microseconds, JS milliseconds, so the
    // version matches within its own millisecond.
    const createData = {
      inspectionId: id,
      mouldConditionLevel: data.mouldConditionLevel ?? undefined,
      visibleGrowthObserved: data.visibleGrowthObserved ?? false,
      affectedAreaM2: data.affectedAreaM2 ?? undefined,
      moistureSourceIdentified: data.moistureSourceIdentified ?? false,
      rootCauseAddressed: data.rootCauseAddressed ?? false,
      pressureDifferentialPa: data.pressureDifferentialPa ?? undefined,
      airChangesPerHour: data.airChangesPerHour ?? undefined,
      containmentBarrierMaterial: data.containmentBarrierMaterial ?? undefined,
      negativePressureMachineModel:
        data.negativePressureMachineModel ?? undefined,
      airSamplingRequired: data.airSamplingRequired ?? false,
      samplingDate: data.samplingDate ? new Date(data.samplingDate) : undefined,
      labName: data.labName ?? undefined,
      labReportReference: data.labReportReference ?? undefined,
      sporeType: data.sporeType ?? undefined,
      sporeCountPreRemediation: data.sporeCountPreRemediation ?? undefined,
      outdoorBaselineCount: data.outdoorBaselineCount ?? undefined,
      sporeCountPostRemediation: data.sporeCountPostRemediation ?? undefined,
      clearanceCriterion: data.clearanceCriterion ?? undefined,
      iepAssessmentRequired: data.iepAssessmentRequired ?? false,
      ...gates,
    };
    const updateData = {
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
    };

    let record;
    try {
      record = await prisma.$transaction(async (tx) => {
        const existing = await tx.mouldRemediationAssessment.findUnique({
          where: { inspectionId: id },
          select: { updatedAt: true },
        });
        let saved;
        if (existing) {
          const expected = data.expectedUpdatedAt
            ? new Date(data.expectedUpdatedAt)
            : null;
          if (!expected) throw new StaleAssessmentError();
          const claimed = await tx.mouldRemediationAssessment.updateMany({
            where: {
              inspectionId: id,
              updatedAt: {
                gte: expected,
                lt: new Date(expected.getTime() + 1),
              },
            },
            data: updateData,
          });
          if (claimed.count !== 1) throw new StaleAssessmentError();
          saved = await tx.mouldRemediationAssessment.findUniqueOrThrow({
            where: { inspectionId: id },
          });
        } else {
          saved = await tx.mouldRemediationAssessment.create({
            data: createData,
          });
        }
        await tx.inspection.update({
          where: tenancy.data.inspectionWhere,
          data: { claimType: "MOULD" },
        });
        return saved;
      });
    } catch (err) {
      if (err instanceof StaleAssessmentError) {
        return NextResponse.json(
          {
            error:
              "This assessment changed since you opened it, for example a confirmed report value. Reload it and check before saving.",
            code: "STALE_ASSESSMENT",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json(record);
  } catch (err) {
    return fromException(req, err, { stage: "mould-remediation:post" });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
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

    await prisma.$transaction([
      prisma.mouldRemediationAssessment.deleteMany({
        where: {
          inspectionId: id,
          ...(tenancy.data.childInspectionFilter && {
            inspection: tenancy.data.childInspectionFilter,
          }),
        },
      }),
      prisma.inspection.update({
        where: tenancy.data.inspectionWhere,
        data: { claimType: null },
      }),
    ]);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fromException(_req, err, { stage: "mould-remediation:delete" });
  }
}
