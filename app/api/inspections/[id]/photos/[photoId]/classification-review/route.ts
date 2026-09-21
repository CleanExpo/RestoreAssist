/**
 * RA-7613 — technician accept / reject / confirm for photo auto-classify.
 *
 * POST /api/inspections/[id]/photos/[photoId]/classification-review
 *   { decision: "accept" | "reject" | "confirm" }
 *
 * Does not call a model. Applies stored InspectionPhoto.aiLabels. Accepted
 * results persist as `ai_suggested` (zero billable quantity until confirm).
 * ACM in the labels raises the WHS latch and cannot clear it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  acceptPhotoClassification,
  billableQuantityForPhotoResult,
  confirmPhotoClassification,
  mergePhotoAiMetadata,
  photoAiLabelsToColumnPatch,
  readPhotoAiMetadata,
  rejectPhotoClassification,
  type PhotoClassificationDecision,
  type PhotoClassificationResult,
} from "@/lib/services/ai/photo-classification-review";

function asLabelRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function previousResultFromMetadata(
  metadata: unknown,
): PhotoClassificationResult | null {
  const meta = readPhotoAiMetadata(metadata);
  if (meta.reviewStatus === "pending") return null;
  return {
    status: meta.reviewStatus,
    provenance: meta.provenance,
    labelledBy: meta.labelledBy,
    fields: meta.acceptedLabels,
    suggestedAreaM2: meta.suggestedAreaM2,
    suspectedAcm: meta.whsLatch.aiRaisedAcm,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
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

    const { id: inspectionId, photoId } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const photo = await prisma.inspectionPhoto.findFirst({
      where: { id: photoId, inspectionId },
      select: { id: true },
    });
    if (!photo) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Photo not found",
        status: 404,
      });
    }

    let body: { decision?: unknown };
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON",
        status: 400,
      });
    }

    const decision = body.decision;
    if (
      decision !== "accept" &&
      decision !== "reject" &&
      decision !== "confirm"
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: 'decision must be "accept", "reject", or "confirm"',
        status: 400,
      });
    }

    const typedDecision = decision as PhotoClassificationDecision;

    type ReviewTxResult =
      | {
          ok: true;
          updated: Record<string, unknown>;
          result: PhotoClassificationResult;
          metadata: Record<string, unknown>;
        }
        | { ok: false; status: number; code: "NOT_FOUND" | "VALIDATION"; message: string };

    const outcome = await prisma.$transaction(async (tx): Promise<ReviewTxResult> => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InspectionPhoto" WHERE "id" = ${photo.id} FOR UPDATE`,
      );
      const current = await tx.inspectionPhoto.findUnique({
        where: { id: photo.id },
        select: {
          id: true,
          aiLabels: true,
          metadata: true,
          labelledBy: true,
          damageCategory: true,
          affectedMaterial: true,
          secondaryDamageIndicators: true,
        },
      });
      if (!current) {
        return {
          ok: false,
          status: 404,
          code: "NOT_FOUND",
          message: "Photo not found",
        };
      }

      const labels = asLabelRecord(current.aiLabels);
      if (
        (typedDecision === "accept" || typedDecision === "reject") &&
        Object.keys(labels).length === 0
      ) {
        return {
          ok: false,
          status: 400,
          code: "VALIDATION",
          message: "No photo AI classification to review",
        };
      }

      const previous = previousResultFromMetadata(current.metadata);
      let result: PhotoClassificationResult;
      if (typedDecision === "accept") {
        result = acceptPhotoClassification(labels);
      } else if (typedDecision === "reject") {
        result = rejectPhotoClassification(labels, current.labelledBy);
      } else {
        if (previous?.status !== "accepted" || previous.fields == null) {
          return {
            ok: false,
            status: 409,
            code: "VALIDATION",
            message: "Confirm requires an accepted photo AI result",
          };
        }
        result = confirmPhotoClassification(previous);
      }

      const metadata = mergePhotoAiMetadata(current.metadata, result, labels);
      const updateData: Record<string, unknown> = {
        metadata: metadata as Prisma.InputJsonValue,
      };
      if (
        current.labelledBy !== "HUMAN_TECH" ||
        result.labelledBy !== "AI_AUTO"
      ) {
        updateData.labelledBy = result.labelledBy;
      }
      if (result.status === "accepted" && result.fields) {
        Object.assign(
          updateData,
          photoAiLabelsToColumnPatch(result.fields, {
            damageCategory: current.damageCategory,
            affectedMaterial: current.affectedMaterial,
            secondaryDamageIndicators: current.secondaryDamageIndicators,
          }),
        );
      }

      const updated = await tx.inspectionPhoto.update({
        where: { id: current.id, inspection: { userId: session.user.id } },
        data: updateData,
        select: {
          id: true,
          labelledBy: true,
          damageCategory: true,
          damageClass: true,
          roomType: true,
          moistureSource: true,
          affectedMaterial: true,
          surfaceOrientation: true,
          damageExtentEstimate: true,
          equipmentVisible: true,
          secondaryDamageIndicators: true,
          photoStage: true,
          captureAngle: true,
          aiLabels: true,
          metadata: true,
        },
      });
      return { ok: true, updated, result, metadata };
    });

    if (!outcome.ok) {
      return apiError(request, {
        code: outcome.code,
        message: outcome.message,
        status: outcome.status,
      });
    }

    const { updated, result, metadata } = outcome;

    await prisma.auditLog.create({
      data: {
        inspectionId,
        action: `Photo AI classification ${result.status}`,
        entityType: "InspectionPhoto",
        entityId: photoId,
        userId: session.user.id,
        changes: JSON.stringify({
          decision: typedDecision,
          provenance: result.provenance,
          billableQuantity: billableQuantityForPhotoResult(result),
        }),
      },
    });

    return NextResponse.json({
      photo: updated,
      review: {
        status: result.status,
        provenance: result.provenance,
        labelledBy: result.labelledBy,
        billableQuantity: billableQuantityForPhotoResult(result),
        suspectedAcm: result.suspectedAcm,
        whsLatch: readPhotoAiMetadata(metadata).whsLatch,
      },
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "photo-classification-review",
    });
  }
}
