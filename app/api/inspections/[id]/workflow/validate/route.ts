import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import {
  validateWorkflowEvidence,
  formatValidationSummary,
} from "@/lib/evidence/submission-validator";
import type { WorkflowForValidation } from "@/lib/evidence/submission-validator";

/**
 * GET /api/inspections/[id]/workflow/validate
 * [RA-401] Pre-submission evidence validation.
 * Returns detailed gap analysis without modifying any data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }

    const { id } = await params;

    // RA-7721: read-only, so the organisation's read reach (the assigned
    // technician included) — the same gate as GET /api/inspections/[id].
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code:
          tenancy.status === 401
            ? "UNAUTHORIZED"
            : tenancy.status === 403
              ? "FORBIDDEN"
              : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    // Fetch workflow with steps and evidence counts
    const workflow = await prisma.inspectionWorkflow.findFirst({
      where: { inspectionId: id },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
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
        },
      },
    });

    if (!workflow) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No workflow found for this inspection",
        status: 404,
      });
    }

    // Map to validation format
    const workflowForValidation: WorkflowForValidation = {
      id: workflow.id,
      jobType: workflow.jobType,
      experienceLevel: workflow.experienceLevel,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        stepKey: step.stepKey,
        stepTitle: step.stepTitle,
        status: step.status,
        isMandatory: step.isMandatory,
        riskTier: step.riskTier,
        minimumEvidenceCount: step.minimumEvidenceCount,
        requiredEvidenceClasses: step.requiredEvidenceClasses,
        evidenceCount: step._count.evidenceItems,
        exceptionReason: (step as any).exceptionReason,
        exceptionNotes: (step as any).exceptionNotes,
      })),
    };

    const result = validateWorkflowEvidence(workflowForValidation);

    return NextResponse.json({
      validation: result,
      summary: formatValidationSummary(result),
    });
  } catch (error) {
    return fromException(request, error, { stage: "workflow-validate" });
  }
}
