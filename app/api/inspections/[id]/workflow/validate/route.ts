import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch workflow with steps and evidence counts
    const workflow = await prisma.inspectionWorkflow.findFirst({
      where: {
        inspectionId: id,
        inspection: { userId: session.user.id },
      },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: {
            _count: {
              select: { evidenceItems: true },
            },
          },
        },
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "No workflow found for this inspection" },
        { status: 404 },
      );
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
        exceptionReason: step.exceptionReason,
        exceptionNotes: step.exceptionNotes,
      })),
    };

    const result = validateWorkflowEvidence(workflowForValidation);

    return NextResponse.json({
      validation: result,
      summary: formatValidationSummary(result),
    });
  } catch (error) {
    console.error("Error validating workflow:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
