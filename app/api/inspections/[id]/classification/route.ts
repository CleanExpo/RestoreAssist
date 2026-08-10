import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET  — latest Classification row(s) for the inspection
 * POST — create or replace the technician-final Classification without full submit
 *
 * Also upserts WaterDamageClassification so S500 gates stay in sync.
 */

const bodySchema = z.object({
  category: z.enum(["1", "2", "3"]),
  class: z.enum(["1", "2", "3", "4"]),
  justification: z.string().trim().min(1).max(4000).optional(),
  standardReference: z.string().trim().max(200).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

function toWaterCategory(category: "1" | "2" | "3"): "CAT_1" | "CAT_2" | "CAT_3" {
  return `CAT_${category}`;
}

function toDamageClass(
  cls: "1" | "2" | "3" | "4",
): "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4" {
  return `CLASS_${cls}`;
}

// GET - Get classification results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        classifications: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            inspectionId: true,
            category: true,
            class: true,
            justification: true,
            standardReference: true,
            confidence: true,
            inputData: true,
            isFinal: true,
            reviewedBy: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        affectedAreas: {
          select: { id: true },
        },
        waterDamageClassification: true,
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    return NextResponse.json({
      classification: inspection.classifications[0] ?? null,
      classifications: inspection.classifications,
      waterDamageClassification: inspection.waterDamageClassification,
      inspection: {
        id: inspection.id,
        status: inspection.status,
        inspectionNumber: inspection.inspectionNumber,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "classification" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        claimType: true,
        photos: { select: { id: true }, take: 20 },
      },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid classification",
        status: 400,
      });
    }

    const {
      category,
      class: damageClass,
      justification,
      standardReference,
      confidence,
    } = parsed.data;

    const finalJustification =
      justification ??
      `Technician-recorded IICRC S500 Category ${category} / Class ${damageClass}.`;

    const classification = await prisma.$transaction(async (tx) => {
      // Mark prior rows non-final so the newest is authoritative.
      await tx.classification.updateMany({
        where: { inspectionId: id, isFinal: true },
        data: { isFinal: false },
      });

      const created = await tx.classification.create({
        data: {
          inspectionId: id,
          category,
          class: damageClass,
          justification: finalJustification,
          standardReference:
            standardReference ?? "IICRC S500:2021 §7.1 (technician recorded)",
          confidence: confidence ?? 100,
          inputData: JSON.stringify({
            source: "manual_classification_tab",
            reviewedBy: session.user.id,
          }),
          isFinal: true,
          reviewedBy: session.user.id,
        },
      });

      const waterCategory = toWaterCategory(category);
      const waterClass = toDamageClass(damageClass);
      const photoCount = inspection.photos.length;

      await tx.waterDamageClassification.upsert({
        where: { inspectionId: id },
        create: {
          inspectionId: id,
          waterCategory,
          damageClass: waterClass,
          gateClassificationComplete: true,
          gateLossSourceComplete: false,
          gatePhotosAttached: photoCount >= 3,
        },
        update: {
          waterCategory,
          damageClass: waterClass,
          gateClassificationComplete: true,
          gatePhotosAttached: photoCount >= 3,
        },
      });

      // Stamp claim type for water when unset so moisture gates activate.
      if (!inspection.claimType) {
        await tx.inspection.update({
          where: { id },
          data: { claimType: "WATER" },
        });
      }

      await tx.auditLog.create({
        data: {
          inspectionId: id,
          action: "Classification recorded",
          entityType: "Classification",
          entityId: created.id,
          userId: session.user.id,
          changes: JSON.stringify({
            category,
            class: damageClass,
            justification: finalJustification,
          }),
        },
      });

      return created;
    });

    return NextResponse.json({ classification }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "classification-post" });
  }
}
