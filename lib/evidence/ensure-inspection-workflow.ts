/**
 * Wave 0 — when an assessment stamps Inspection.claimType, ensure a guided
 * capture workflow exists for the mapped JobType (idempotent; never overwrites).
 */

import type { Prisma } from "@prisma/client";
import {
  buildWorkflowStepsData,
  getWorkflowTemplate,
  type JobType,
} from "./workflow-definitions";
import { normalizeClaimType } from "./claim-type";

export async function ensureInspectionWorkflowFromClaimType(
  tx: Prisma.TransactionClient,
  inspectionId: string,
  prismaClaimType: string,
  experienceLevel = "APPRENTICE",
): Promise<JobType | null> {
  const jobType = normalizeClaimType(prismaClaimType);
  if (!jobType) return null;

  const existing = await tx.inspectionWorkflow.findUnique({
    where: { inspectionId },
    select: { id: true },
  });
  if (existing) return jobType;

  const template = getWorkflowTemplate(jobType);
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

  const stepsData = buildWorkflowStepsData(wf.id, jobType);
  const now = new Date();
  for (const step of stepsData) {
    await tx.workflowStep.create({
      data: { ...step, createdAt: now },
    });
  }

  return jobType;
}