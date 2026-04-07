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
import type { JobType } from "@/lib/evidence/workflow-definitions";
import type { EvidenceClass } from "@/lib/types/evidence";
/**
 * [RA-406] Insurer Profile API
 * GET  — Retrieve insurer profile for an inspection (or list all profiles)
 * POST — Set/update insurer profile for an inspection and get evidence gap analysis
 */

interface RouteContext {
  params: { id: string };
}

// ━━━ GET: Retrieve insurer profile or list all ━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = params;

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

  // Verify the inspection exists and belongs to user's org
  const inspection = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      organizationId: session.user.organizationId,
    },
    select: {
      id: true,
      insurerRef: true,
      jobType: true,
      metadata: true,
    },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  // Extract insurer ID from metadata
  const metadata = (inspection.metadata as Record<string, unknown>) ?? {};
  const insurerId = metadata.insurerProfileId as string | undefined;

  if (!insurerId || !isValidInsurerId(insurerId)) {
    return NextResponse.json({
      insurerProfile: null,
      message: "No insurer profile assigned to this inspection.",
      availableProfiles: Object.entries(INSURER_LABELS).map(([id, label]) => ({
        id,
        label,
      })),
    });
  }

  const profile = getInsurerProfile(insurerId as InsurerId);
  const jobType = (inspection.jobType as JobType) ?? undefined;
  const evidenceReqs = getEvidenceRequirements(insurerId as InsurerId, jobType);
  const reportSections = getReportSections(insurerId as InsurerId, jobType);

  return NextResponse.json({
    insurerProfile: profile,
    evidenceRequirements: evidenceReqs,
    reportSections,
    inspectionJobType: jobType,
  });
}
// ━━━ POST: Set insurer profile + evidence gap analysis ━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = params;

  let body: {
    insurerId: string;
    claimRef?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.insurerId || !isValidInsurerId(body.insurerId)) {
    return NextResponse.json(
      {
        error: `Invalid insurer ID. Valid IDs: ${Object.keys(INSURER_LABELS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const insurerId = body.insurerId as InsurerId;

  // Verify inspection ownership
  const inspection = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      organizationId: session.user.organizationId,
    },
    select: {
      id: true,
      jobType: true,
      metadata: true,
    },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const jobType = (inspection.jobType as JobType) ?? undefined;

  // Update inspection metadata with insurer profile
  const existingMetadata =
    (inspection.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = {
    ...existingMetadata,
    insurerProfileId: insurerId,
    insurerClaimRef: body.claimRef ?? existingMetadata.insurerClaimRef,
    insurerProfileSetAt: new Date().toISOString(),
  };

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { metadata: updatedMetadata },
  });

  // Get profile data for response
  const profile = getInsurerProfile(insurerId);
  const evidenceReqs = getEvidenceRequirements(insurerId, jobType);
  const reportSections = getReportSections(insurerId, jobType);

  // Run evidence gap analysis if evidence exists
  const evidenceCounts = await prisma.inspectionEvidence.groupBy({
    by: ["evidenceClass"],
    where: { inspectionId },
    _count: { id: true },
  });

  const submittedEvidence = evidenceCounts.map((e) => ({
    evidenceClass: e.evidenceClass as EvidenceClass,
    count: e._count.id,
  }));

  const missingEvidence = jobType
    ? getMissingMandatoryEvidence(insurerId, jobType, submittedEvidence)
    : [];

  // Format claim reference if provided
  const formattedClaimRef = body.claimRef
    ? formatClaimReference(insurerId, body.claimRef, new Date(), "REPORT")
    : undefined;

  return NextResponse.json({
    success: true,
    insurerProfile: profile,
    evidenceRequirements: evidenceReqs,
    reportSections,
    evidenceGapAnalysis: {
      totalMandatory: evidenceReqs.filter((r) => r.mandatory).length,
      totalSubmitted: submittedEvidence.length,
      missing: missingEvidence,
      isComplete: missingEvidence.length === 0,
    },
    formattedClaimRef,
    inspectionJobType: jobType,
  });
}
