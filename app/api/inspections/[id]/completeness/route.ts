import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSubmission } from "@/lib/evidence/submission-gate";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { JOB_TYPES } from "@/lib/evidence/workflow-definitions";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Check evidence completeness for an inspection
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

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Accept claimType from query param or default to "water_damage".
    // RA-6994: WORKFLOW_TEMPLATES is keyed on uppercase JobType values
    // (e.g. "WATER_DAMAGE") — normalise here so the requirements lookup
    // actually matches instead of silently returning zero requirements.
    const { searchParams } = new URL(request.url);
    const rawClaimType = searchParams.get("claimType") ?? "water_damage";
    const claimType = normalizeClaimType(rawClaimType);

    if (!claimType) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Unknown claimType "${rawClaimType}". Accepted values: ${JOB_TYPES.join(", ")} (case-insensitive).`,
        status: 400,
      });
    }

    const validation = await validateSubmission(id, claimType);

    return NextResponse.json({
      data: {
        completionPercentage: validation.completionPercentage,
        totalRequired: validation.totalRequired,
        totalCaptured: validation.totalCaptured,
        gaps: validation.gaps,
        warnings: validation.warnings,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "completeness" });
  }
}
