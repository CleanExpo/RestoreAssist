import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * [RA-402] Admin Evidence Review API
 * Returns inspections with workflow evidence completeness data.
 * Filters: technician, jobType, status (incomplete/stale/all), search.
 * Admin-only endpoint.
 */

// Stale threshold: inspections with workflows older than 48 hours without submission
const STALE_HOURS = 48;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const technicianFilter = searchParams.get("technician")?.trim() ?? "";
  const jobTypeFilter = searchParams.get("jobType")?.trim() ?? "";
  const statusFilter = searchParams.get("status")?.trim() ?? ""; // incomplete | stale | all
  const search = searchParams.get("search")?.trim() ?? "";

  // Build where clause for inspections that have workflows
  const inspectionWhere: Record<string, unknown> = {
    inspectionWorkflow: { isNot: null },
  };

  if (search) {
    inspectionWhere.OR = [
      { inspectionNumber: { contains: search, mode: "insensitive" } },
      { propertyAddress: { contains: search, mode: "insensitive" } },
      { technicianName: { contains: search, mode: "insensitive" } },
    ];
  }

  if (technicianFilter) {
    inspectionWhere.technicianName = {
      contains: technicianFilter,
      mode: "insensitive",
    };
  }

  if (jobTypeFilter) {
    inspectionWhere.inspectionWorkflow = {
      isNot: null,
      jobType: jobTypeFilter,
    };
  }

  // Filter by status
  if (statusFilter === "incomplete") {
    inspectionWhere.status = { in: ["DRAFT", "IN_PROGRESS"] };
  } else if (statusFilter === "stale") {
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    inspectionWhere.status = { in: ["DRAFT", "IN_PROGRESS"] };
    inspectionWhere.updatedAt = { lt: staleThreshold };
  }

  const inspections = await prisma.inspection.findMany({
    where: inspectionWhere,
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      technicianName: true,
      status: true,
      inspectionDate: true,
      submittedAt: true,
      updatedAt: true,
      inspectionWorkflow: {
        select: {
          id: true,
          jobType: true,
          experienceLevel: true,
          totalSteps: true,
          completedSteps: true,
          skippedSteps: true,
          isReadyToSubmit: true,
          submissionScore: true,
          lastValidatedAt: true,
          startedAt: true,
          completedAt: true,
          steps: {
            select: {
              id: true,
              stepKey: true,
              stepTitle: true,
              status: true,
              isMandatory: true,
              riskTier: true,
              minimumEvidenceCount: true,
              requiredEvidenceClasses: true,
              _count: {
                select: { evidenceItems: true },
              },
            },
            orderBy: { stepOrder: "asc" },
          },
        },
      },
      _count: {
        select: { evidenceItems: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });

  // Compute summary stats
  let totalWithWorkflow = 0;
  let totalIncomplete = 0;
  let totalStale = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

  const enriched = inspections.map((insp) => {
    const wf = insp.inspectionWorkflow;
    totalWithWorkflow++;

    const score = wf?.submissionScore ?? null;
    if (score !== null) {
      scoreSum += score;
      scoreCount++;
    }

    const isIncomplete =
      !wf?.isReadyToSubmit && ["DRAFT", "IN_PROGRESS"].includes(insp.status);
    const isStale =
      isIncomplete &&
      new Date(insp.updatedAt).getTime() < staleThreshold.getTime();

    if (isIncomplete) totalIncomplete++;
    if (isStale) totalStale++;

    // Compute per-step gap summary
    const stepGaps = (wf?.steps ?? [])
      .filter((s) => {
        if (
          s.status === "COMPLETED" &&
          s._count.evidenceItems >= s.minimumEvidenceCount
        )
          return false;
        if (s.status === "SKIPPED") return s.isMandatory;
        return s.status !== "COMPLETED";
      })
      .map((s) => ({
        stepKey: s.stepKey,
        stepTitle: s.stepTitle,
        riskTier: s.riskTier,
        isMandatory: s.isMandatory,
        status: s.status,
        evidenceCount: s._count.evidenceItems,
        minimumRequired: s.minimumEvidenceCount,
      }));

    return {
      id: insp.id,
      inspectionNumber: insp.inspectionNumber,
      propertyAddress: insp.propertyAddress,
      technicianName: insp.technicianName,
      status: insp.status,
      inspectionDate: insp.inspectionDate,
      submittedAt: insp.submittedAt,
      updatedAt: insp.updatedAt,
      totalEvidence: insp._count.evidenceItems,
      isIncomplete,
      isStale,
      workflow: wf
        ? {
            jobType: wf.jobType,
            experienceLevel: wf.experienceLevel,
            totalSteps: wf.totalSteps,
            completedSteps: wf.completedSteps,
            skippedSteps: wf.skippedSteps,
            isReadyToSubmit: wf.isReadyToSubmit,
            submissionScore: wf.submissionScore,
            lastValidatedAt: wf.lastValidatedAt,
          }
        : null,
      stepGaps,
    };
  });

  const summary = {
    totalWithWorkflow,
    totalIncomplete,
    totalStale,
    averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
  };

  return NextResponse.json({ inspections: enriched, summary });
}
