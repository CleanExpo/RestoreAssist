import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isValidInsurerId,
  getInsurerProfile,
  getEvidenceRequirements,
  getReportSections,
  getMissingMandatoryEvidence,
  formatClaimReference,
  getAllInsurerProfiles,
  INSURER_LABELS,
} from "@/lib/insurer-profiles";
import type { InsurerId } from "@/lib/insurer-profiles";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import type { JobType } from "@/lib/evidence/workflow-definitions";
import type { EvidenceClass } from "@/lib/types/evidence";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * [RA-406] Insurer Profile API
 * GET  — Retrieve insurer profile for an inspection (or list all profiles)
 * POST — Compute insurer evidence gap analysis for an inspection
 *
 * RA-7570: `Inspection` has no `jobType` or `metadata` columns. Job type is
 * `InspectionWorkflow.jobType`, with `Inspection.claimType` as the fallback
 * equivalent via `normalizeClaimType`. Per-inspection insurer assignment has
 * no canonical column yet (spec P3-3: `Inspection.insurerProfileId` +
 * `claimNumber`) — do not write a phantom JSON blob. GET reports unassigned;
 * POST returns the computed profile for the current request.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

const inspectionSelect = {
  id: true,
  claimType: true,
  inspectionWorkflow: {
    select: { jobType: true },
  },
} as const;

type LoadedInspection = {
  id: string;
  claimType: string | null;
  inspectionWorkflow: { jobType: string } | null;
};

function resolveJobType(inspection: LoadedInspection): JobType | null {
  return (
    normalizeClaimType(inspection.inspectionWorkflow?.jobType) ??
    normalizeClaimType(inspection.claimType)
  );
}

function availableProfiles() {
  return Object.entries(INSURER_LABELS).map(([id, label]) => ({
    id,
    label,
  }));
}

async function loadOwnedInspection(inspectionId: string, userId: string) {
  return prisma.inspection.findFirst({
    where: { id: inspectionId, userId },
    select: inspectionSelect,
  });
}

// ━━━ GET: Retrieve insurer profile or list all ━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest, { params }: RouteContext) {
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
    // If inspectionId is "list", return all available profiles
    if (inspectionId === "list") {
      const profiles = getAllInsurerProfiles().map((p) => ({
        id: p.id,
        name: p.name,
        label: INSURER_LABELS[p.id],
        brands: p.brands,
        claimsSystem: p.claimsSystem,
        marketShare: p.marketShare,
      }));
      return NextResponse.json({ profiles });
    }

    const inspection = await loadOwnedInspection(
      inspectionId,
      session.user.id,
    );

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Assignment is not persisted (no Inspection.insurerProfileId yet).
    return NextResponse.json({
      insurerProfile: null,
      message: "No insurer profile assigned to this inspection.",
      availableProfiles: availableProfiles(),
      inspectionJobType: resolveJobType(inspection),
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-insurer-profile-get",
    });
  }
}
// ━━━ POST: Set insurer profile + evidence gap analysis ━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // RA-1266: setting insurer profile triggers evidence gap analysis —
  // retry recomputes identical analysis unnecessarily.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: {
        insurerId: string;
        claimRef?: string;
      };

      try {
        body = (rawBody ? JSON.parse(rawBody) : {}) as {
          insurerId: string;
          claimRef?: string;
        };
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      if (!body.insurerId || !isValidInsurerId(body.insurerId)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Invalid insurer ID. Valid IDs: ${Object.keys(INSURER_LABELS).join(", ")}`,
          status: 400,
        });
      }

      const insurerId = body.insurerId as InsurerId;

      const inspection = await loadOwnedInspection(inspectionId, userId);

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      const jobType = resolveJobType(inspection);
      if (!jobType) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "This inspection has no job type. Initialise a workflow or set a claim type before applying an insurer profile.",
          status: 422,
        });
      }

      const profile = getInsurerProfile(insurerId);
      const evidenceReqs = getEvidenceRequirements(insurerId, jobType);
      const reportSections = getReportSections(insurerId, jobType);

      // EvidenceItem is the schema owner of inspectionId + evidenceClass
      // (composite index @@index([inspectionId, evidenceClass])). There is no
      // InspectionEvidence model — querying it 500s every caller (RA-7508).
      const evidenceCounts = await prisma.evidenceItem.groupBy({
        by: ["evidenceClass"],
        where: { inspectionId },
        _count: { id: true },
      });

      const submittedEvidence = evidenceCounts.map((row) => ({
        // Prisma EvidenceClass includes AFFECTED_CONTENTS; the insurer-profile
        // union in lib/types/evidence.ts does not. Narrow at the boundary.
        evidenceClass: row.evidenceClass as EvidenceClass,
        count: row._count.id,
      }));

      const missingEvidence = getMissingMandatoryEvidence(
        insurerId,
        jobType,
        submittedEvidence,
      );

      const formattedClaimRef = body.claimRef
        ? formatClaimReference(insurerId, body.claimRef, new Date(), "REPORT")
        : undefined;

      return NextResponse.json({
        success: true,
        insurerProfile: profile,
        evidenceRequirements: evidenceReqs,
        reportSections,
        submittedEvidence,
        evidenceGapAnalysis: {
          totalMandatory: evidenceReqs.filter((r) => r.mandatory).length,
          totalSubmitted: submittedEvidence.length,
          missing: missingEvidence,
          isComplete: missingEvidence.length === 0,
        },
        formattedClaimRef,
        inspectionJobType: jobType,
      });
    } catch (error) {
      return fromException(request, error, {
        stage: "inspection-insurer-profile-post",
      });
    }
  });
}
