/**
 * Sprint G: Workflow API — GET/PATCH for guided capture workflow
 * GET  /api/inspections/[id]/workflow — Load or initialize workflow for inspection
 * PATCH /api/inspections/[id]/workflow — Update step status, skip with reason
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkflowTemplate, buildWorkflowStepsData } from "@/lib/evidence";
import type { JobType } from "@/lib/evidence";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionAssignedWrite,
  assertInspectionReadable,
} from "@/lib/auth/assert-tenancy";

// RA-7721 / D6: keep the apiError envelope for tenancy refusals.
function tenancyError(
  request: NextRequest,
  tenancy: { status: 401 | 403 | 404; reason: string },
) {
  const code =
    tenancy.status === 401
      ? "UNAUTHORIZED"
      : tenancy.status === 403
        ? "FORBIDDEN"
        : "NOT_FOUND";
  return apiError(request, { code, message: tenancy.reason, status: tenancy.status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }

  const { id: inspectionId } = await params;

  try {
    // RA-7721: read-only, so the organisation's read reach (the assigned
    // technician included) — the same gate as GET /api/inspections/[id].
    const tenancy = await assertInspectionReadable(session, inspectionId);
    if (!tenancy.ok) return tenancyError(request, tenancy);

    // Check for existing workflow
    let workflow = await prisma.inspectionWorkflow.findUnique({
      where: { inspectionId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
      },
    });

    if (!workflow) {
      // Return null — workflow hasn't been initialized yet
      return NextResponse.json({ workflow: null });
    }

    // Load evidence items for this inspection (grouped by step)
    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId },
      orderBy: { capturedAt: "desc" },
      take: 500,
    });

    // Load exception reasons
    const exceptions = await prisma.exceptionReason.findMany({
      where: { evidenceItem: { inspectionId } },
      take: 500,
    });

    return NextResponse.json({
      workflow: {
        ...workflow,
        evidenceItems,
        exceptions,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "load" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }

  const { id: inspectionId } = await params;
  const body = await request.json();
  const { jobType, experienceLevel = "APPRENTICE" } = body as {
    jobType: string;
    experienceLevel?: string;
  };

  try {
    // RA-7721: starting the workflow fixes the job type for everyone (one row
    // per job), so it is a write: the owner's reach or the assigned technician.
    const tenancy = await assertInspectionAssignedWrite(session, inspectionId);
    if (!tenancy.ok) return tenancyError(request, tenancy);

    // Validate job type
    const template = getWorkflowTemplate(jobType as JobType);

    // Create workflow + steps in a transaction
    const workflow = await prisma.$transaction(async (tx) => {
      const wf = await tx.inspectionWorkflow.create({
        data: {
          inspectionId,
          jobType,
          experienceLevel,
          currentStepOrder: 0,
          totalSteps: template.steps.length,
          completedSteps: 0,
          skippedSteps: 0,
        },
      });

      const stepsData = buildWorkflowStepsData(wf.id, jobType as JobType);
      for (const step of stepsData) {
        await tx.workflowStep.create({
          data: {
            ...step,
            createdAt: new Date(),
          },
        });
      }

      return await tx.inspectionWorkflow.findUnique({
        where: { id: wf.id },
        include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          select: {
            id: true,
            workflowId: true,
            stepOrder: true,
            stepKey: true,
            stepTitle: true,
            stepDescription: true,
            stepDescriptionShort: true,
            requiredEvidenceClasses: true,
            optionalEvidenceClasses: true,
            minimumEvidenceCount: true,
            isMandatory: true,
            riskTier: true,
            escalationNote: true,
            status: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      });
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "create" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }

  const { id: inspectionId } = await params;
  const body = await request.json();
  const { stepId, status, skipReason, skipNotes } = body as {
    stepId: string;
    status: "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "BLOCKED";
    skipReason?: string;
    skipNotes?: string;
  };

  try {
    // RA-7721: the owner's reach or the assigned technician.
    const tenancy = await assertInspectionAssignedWrite(session, inspectionId);
    if (!tenancy.ok) return tenancyError(request, tenancy);
    const { childInspectionFilter } = tenancy.data;

    const workflow = await prisma.inspectionWorkflow.findUnique({
      where: { inspectionId },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          select: {
            id: true,
            workflowId: true,
            stepOrder: true,
            stepKey: true,
            stepTitle: true,
            stepDescription: true,
            stepDescriptionShort: true,
            requiredEvidenceClasses: true,
            optionalEvidenceClasses: true,
            minimumEvidenceCount: true,
            isMandatory: true,
            riskTier: true,
            escalationNote: true,
            status: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!workflow) {
      return apiError(request, { code: "NOT_FOUND", message: "Workflow not found", status: 404 });
    }

    // Update step status. RA-6800: scope the write to the workflow we just
    // verified as owned by the caller's inspection, so a client-supplied
    // stepId cannot flip a step belonging to another tenant's workflow.
    // RA-7721 / D5: also re-assert the caller's scope inside the write, so a
    // reassignment between the check and this statement matches 0 rows.
    const stepUpdate = await prisma.workflowStep.updateMany({
      where: {
        id: stepId,
        workflowId: workflow.id,
        ...(childInspectionFilter && {
          workflow: { inspection: childInspectionFilter },
        }),
      },
      data: { status, updatedAt: new Date() },
    });
    if (stepUpdate.count === 0) {
      return apiError(request, { code: "NOT_FOUND", message: "Workflow step not found", status: 404 });
    }

    // Recalculate workflow totals
    const allSteps = await prisma.workflowStep.findMany({
      where: { workflowId: workflow.id },
      orderBy: { stepOrder: "asc" },
      take: 100,
    });

    const completedSteps = allSteps.filter(
      (s) => s.status === "COMPLETED",
    ).length;
    const skippedSteps = allSteps.filter((s) => s.status === "SKIPPED").length;

    // Find next incomplete step for currentStepOrder
    const nextIncomplete = allSteps.find(
      (s) => s.status === "NOT_STARTED" || s.status === "IN_PROGRESS",
    );

    // Calculate submission readiness
    const mandatorySteps = allSteps.filter((s) => s.isMandatory);
    const mandatoryDone = mandatorySteps.every(
      (s) => s.status === "COMPLETED" || s.status === "SKIPPED",
    );

    // Calculate submission score (0-100)
    const totalWeight = allSteps.length;
    const completedWeight = completedSteps + skippedSteps * 0.5;
    const submissionScore = Math.round((completedWeight / totalWeight) * 100);

    await prisma.inspectionWorkflow.update({
      where: { id: workflow.id },
      data: {
        completedSteps,
        skippedSteps,
        currentStepOrder: nextIncomplete?.stepOrder ?? workflow.totalSteps,
        isReadyToSubmit: mandatoryDone,
        submissionScore,
        updatedAt: new Date(),
      },
    });

    // Reload full workflow
    const updated = await prisma.inspectionWorkflow.findUnique({
      where: { id: workflow.id },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          select: {
            id: true,
            workflowId: true,
            stepOrder: true,
            stepKey: true,
            stepTitle: true,
            stepDescription: true,
            stepDescriptionShort: true,
            requiredEvidenceClasses: true,
            optionalEvidenceClasses: true,
            minimumEvidenceCount: true,
            isMandatory: true,
            riskTier: true,
            escalationNote: true,
            status: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json({ workflow: updated });
  } catch (error) {
    return fromException(request, error, { stage: "update" });
  }
}
