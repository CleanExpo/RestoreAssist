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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = await params;

  try {
    // Verify inspection ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
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
    console.error("[evidence/qa-scores GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
