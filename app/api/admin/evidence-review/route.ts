import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import {
  isPlatformSupportOperator,
  resolveInspectionReach,
} from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * RA-7566 CLEAR bar: a tenant admin must never receive another organisation's
 * inspection. If a foreign row still reaches this handler (Prisma where
 * missed, search OR overwrite, take-window race), fail closed with 403 and
 * no row payload. Platform-support operators are the only cross-tenant
 * exception, and that allowlist fails closed when unset.
 */
function isForeignTenantInspection(
  caller: { id: string; organizationId: string | null },
  row: {
    userId: string;
    user: { organizationId: string | null } | null;
    workspace: { members: Array<{ userId: string }> } | null;
  },
): boolean {
  if (isPlatformSupportOperator(caller.id)) return false;
  // Same clauses as resolveInspectionReach / ownershipClauses — owner,
  // active workspace member, or same organisation. A workspace-reachable
  // job must not 403 the whole evidence-review list.
  if (row.userId === caller.id) return false;
  if ((row.workspace?.members.length ?? 0) > 0) return false;
  const callerOrg = caller.organizationId;
  const rowOrg = row.user?.organizationId ?? null;
  if (typeof callerOrg === "string" && callerOrg.length > 0) {
    return rowOrg !== callerOrg;
  }
  return true;
}

/**
 * [RA-402] Admin Evidence Review API
 * Returns inspections with workflow evidence completeness data.
 * Filters: technician, jobType, status (incomplete/stale/all), search.
 *
 * RA-7566 / D-023: `role: "ADMIN"` means owner of this organisation, not
 * RestoreAssist staff. Reach is the caller's organisation (or an allowlisted
 * platform-support operator). The tenancy clause is merged with AND so the
 * search box cannot erase it.
 */

// Stale threshold: inspections with workflows older than 48 hours without submission
const STALE_HOURS = 48;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const reach = await resolveInspectionReach(session);
    if (!reach.ok) {
      // Generic copy only — never echo reach.reason, which could name a
      // record. Unauthenticated stays 401; every other tenancy miss is 403.
      if (reach.status === 401) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return forbidden();
    }
    const adminUser = auth.user!;

    const { searchParams } = new URL(request.url);
    const technicianFilter = searchParams.get("technician")?.trim() ?? "";
    const jobTypeFilter = searchParams.get("jobType")?.trim() ?? "";
    const statusFilter = searchParams.get("status")?.trim() ?? ""; // incomplete | stale | all
    const search = searchParams.get("search")?.trim() ?? "";

    // Build where clause for inspections that have workflows.
    // `reach.data` is already wrapped in AND (D-023). Assigning search
    // to `OR` below therefore cannot overwrite the organisation filter.
    const inspectionWhere: Prisma.InspectionWhereInput = {
      ...reach.data,
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
      // `is` implies the 1-1 workflow exists, so this keeps the
      // inspectionWorkflow-isNot-null gate and adds the job-type match.
      inspectionWhere.inspectionWorkflow = {
        is: { jobType: jobTypeFilter },
      };
    }

    // InspectionStatus has no IN_PROGRESS (see RA-7550). Incomplete / stale
    // therefore means DRAFT — the previous IN_PROGRESS literal was not a
    // valid enum member and could not match a row.
    if (statusFilter === "incomplete") {
      inspectionWhere.status = { in: ["DRAFT"] };
    } else if (statusFilter === "stale") {
      const staleThreshold = new Date(
        Date.now() - STALE_HOURS * 60 * 60 * 1000,
      );
      inspectionWhere.status = { in: ["DRAFT"] };
      inspectionWhere.updatedAt = { lt: staleThreshold };
    }

    const inspections = await prisma.inspection.findMany({
      where: inspectionWhere,
      select: {
        id: true,
        userId: true,
        inspectionNumber: true,
        propertyAddress: true,
        technicianName: true,
        status: true,
        inspectionDate: true,
        submittedAt: true,
        updatedAt: true,
        user: { select: { organizationId: true } },
        workspace: {
          select: {
            members: {
              where: { userId: adminUser.id, status: "ACTIVE" },
              select: { userId: true },
              take: 1,
            },
          },
        },
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

    if (
      inspections.some((row) => isForeignTenantInspection(adminUser, row))
    ) {
      return forbidden();
    }

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
  } catch (err) {
    return fromException(request, err, { stage: "evidence-review:list" });
  }
}
