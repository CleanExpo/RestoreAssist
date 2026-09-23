/**
 * Water Damage Classification API — RA-261 Phase 1
 *
 * GET  /api/inspections/[id]/water-damage-classification
 *   Returns the current classification record and computed gate states.
 *
 * POST /api/inspections/[id]/water-damage-classification
 *   Creates or upserts the classification record. Recomputes gate states.
 *   Also stamps Inspection.claimType = WATER on creation.
 *
 * DELETE /api/inspections/[id]/water-damage-classification
 *   Removes the record (used when claim type changes).
 *
 * Gate logic:
 *   gateClassificationComplete = waterCategory + damageClass both set
 *   gateLossSourceComplete      = lossSourceType set AND lossSourceIdentified AND lossSourceAddressed
 *   gatePhotosAttached          = inspection has ≥3 photos (checked via InspectionPhoto count)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";
import type { Prisma } from "@prisma/client";
import {
  MANUAL_OVERRIDE_JUSTIFICATION,
  MANUAL_OVERRIDE_REFERENCE,
} from "@/lib/nir-classification-engine";
import { persistInspectionClassification } from "@/lib/nir-classification-persist";

// ─── Validation ────────────────────────────────────────────────────────────────

const classificationSchema = z.object({
  waterCategory: z.enum(["CAT_1", "CAT_2", "CAT_3"]).nullable().optional(),
  damageClass: z
    .enum(["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"])
    .nullable()
    .optional(),
  lossSourceType: z
    .enum([
      "PLUMBING",
      "ROOF",
      "APPLIANCE",
      "FLOOD",
      "GROUNDWATER",
      "CONDENSATION",
      "HVAC",
      "UNKNOWN",
    ])
    .nullable()
    .optional(),
  lossSourceIdentified: z.boolean().optional(),
  lossSourceAddressed: z.boolean().optional(),
  hoursOfExposure: z.number().positive().nullable().optional(),
});

// ─── Gate computation ──────────────────────────────────────────────────────────

function computeGates(
  data: z.infer<typeof classificationSchema>,
  photoCount: number,
) {
  return {
    gateClassificationComplete: !!(data.waterCategory && data.damageClass),
    gateLossSourceComplete: !!(
      data.lossSourceType &&
      data.lossSourceIdentified === true &&
      data.lossSourceAddressed === true
    ),
    gatePhotosAttached: photoCount >= 3,
  };
}

// ─── Technician choice (RA-7709) ─────────────────────────────────────────────

type ChoiceFields = {
  waterCategory?: string | null;
  damageClass?: string | null;
} | null;

function choiceKey(r: ChoiceFields): string | null {
  return r?.waterCategory && r?.damageClass
    ? `${r.waterCategory}/${r.damageClass}`
    : null;
}

/**
 * A Category / Class pick in the Claim-type evidence panel is the technician's
 * choice. Record it as the inspection's Classification row with reviewedBy —
 * the signal submit honours — only when the pick itself changed. Clearing a
 * pick on a DRAFT removes that row so submit classifies automatically. After
 * submit the saved row is left as it is (see RA-7709 report).
 */
async function syncTechnicianChoice(
  tx: Prisma.TransactionClient,
  inspectionId: string,
  status: string,
  userId: string,
  before: ChoiceFields,
  after: ChoiceFields,
) {
  const beforeKey = choiceKey(before);
  const afterKey = choiceKey(after);
  if (beforeKey === afterKey) return;

  if (afterKey && after?.waterCategory && after.damageClass) {
    await persistInspectionClassification(tx, inspectionId, {
      category: after.waterCategory.replace("CAT_", ""),
      class: after.damageClass.replace("CLASS_", ""),
      justification: MANUAL_OVERRIDE_JUSTIFICATION,
      standardReference: MANUAL_OVERRIDE_REFERENCE,
      confidence: 100,
      inputData: JSON.stringify({ source: "claim_assessment_panel" }),
      isFinal: status !== "DRAFT",
      reviewedBy: userId,
    });
  } else if (status === "DRAFT") {
    await tx.classification.deleteMany({
      where: { inspectionId, reviewedBy: { not: null } },
    });
  }
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

    const inspection = await prisma.inspection.findUnique({
      where: { id, userId: session.user.id },
      select: { id: true, waterDamageClassification: true },
    });

    if (!inspection) {
      return apiError(_req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    return NextResponse.json(inspection.waterDamageClassification ?? null);
  } catch (err) {
    return fromException(_req, err, {
      stage: "water-damage-classification:get",
    });
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

    const inspection = await prisma.inspection.findUnique({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        status: true,
        _count: { select: { photos: true } },
      },
    });

    if (!inspection) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const body = await req.json();
    const parsed = classificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const gates = computeGates(data, inspection._count.photos);

    // Atomically upsert classification + stamp claimType + record the
    // technician's Category / Class choice (RA-7709) — prevents split-brain
    // state if DB connection drops between the writes.
    const record = await prisma.$transaction(async (tx) => {
      const before = await tx.waterDamageClassification.findUnique({
        where: { inspectionId: id },
        select: { waterCategory: true, damageClass: true },
      });
      const saved = await tx.waterDamageClassification.upsert({
        where: { inspectionId: id },
        create: {
          inspectionId: id,
          waterCategory: data.waterCategory ?? undefined,
          damageClass: data.damageClass ?? undefined,
          lossSourceType: data.lossSourceType ?? undefined,
          lossSourceIdentified: data.lossSourceIdentified ?? false,
          lossSourceAddressed: data.lossSourceAddressed ?? false,
          hoursOfExposure: data.hoursOfExposure ?? undefined,
          ...gates,
        },
        update: {
          ...(data.waterCategory !== undefined && {
            waterCategory: data.waterCategory,
          }),
          ...(data.damageClass !== undefined && {
            damageClass: data.damageClass,
          }),
          ...(data.lossSourceType !== undefined && {
            lossSourceType: data.lossSourceType,
          }),
          ...(data.lossSourceIdentified !== undefined && {
            lossSourceIdentified: data.lossSourceIdentified,
          }),
          ...(data.lossSourceAddressed !== undefined && {
            lossSourceAddressed: data.lossSourceAddressed,
          }),
          ...(data.hoursOfExposure !== undefined && {
            hoursOfExposure: data.hoursOfExposure,
          }),
          ...gates,
        },
      });
      await tx.inspection.update({
        where: { id, userId: session.user.id },
        data: { claimType: "WATER" },
      });
      await syncTechnicianChoice(
        tx,
        id,
        inspection.status,
        session.user.id,
        before,
        saved,
      );
      return saved;
    });

    return NextResponse.json(record);
  } catch (err) {
    return fromException(req, err, {
      stage: "water-damage-classification:post",
    });
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

    const inspection = await prisma.inspection.findUnique({
      where: { id, userId: session.user.id },
      select: { id: true, status: true },
    });

    if (!inspection) {
      return apiError(_req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.waterDamageClassification.deleteMany({
        where: { inspectionId: id, inspection: { userId: session.user.id } },
      });
      await tx.inspection.update({
        where: { id, userId: session.user.id },
        data: { claimType: null },
      });
      // RA-7709: removing the panel record removes the pick it carried.
      if (inspection.status === "DRAFT") {
        await tx.classification.deleteMany({
          where: { inspectionId: id, reviewedBy: { not: null } },
        });
      }
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fromException(_req, err, {
      stage: "water-damage-classification:delete",
    });
  }
}
