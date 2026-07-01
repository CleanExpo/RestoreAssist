/**
 * Sprint I: Evidence QA Scoring API
 * [RA-411] GET /api/inspections/[id]/evidence/qa-scores
 *
 * Returns quality scores for all evidence items on an inspection.
 * Purely algorithmic scoring — no external API calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  scoreInspectionEvidence,
  type EvidenceItemForQA,
} from "@/lib/evidence/qa-scorer";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: inspectionId } = await params;

  try {
    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Fetch evidence items with only the fields needed for QA scoring
    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId },
      select: {
        id: true,
        evidenceClass: true,
        fileUrl: true,
        fileSizeBytes: true,
        description: true,
        capturedLat: true,
        capturedLng: true,
        capturedAt: true,
        structuredData: true,
        // Check if linked to a mandatory workflow step
        workflowStep: {
          select: {
            isMandatory: true,
          },
        },
      },
      orderBy: { capturedAt: "desc" },
      take: 500,
    });

    // Map to QA scorer input shape
    const itemsForQA: EvidenceItemForQA[] = evidenceItems.map((item) => ({
      id: item.id,
      evidenceClass: item.evidenceClass,
      fileUrl: item.fileUrl,
      fileSizeBytes: item.fileSizeBytes,
      description: item.description,
      capturedLat: item.capturedLat,
      capturedLng: item.capturedLng,
      capturedAt: item.capturedAt,
      structuredData: item.structuredData,
      isMandatory: item.workflowStep?.isMandatory ?? false,
    }));

    const result = scoreInspectionEvidence(inspectionId, itemsForQA);

    return NextResponse.json({ data: result });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-qa-scores-get" });
  }
}
