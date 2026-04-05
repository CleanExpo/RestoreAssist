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
    // Verify inspection belongs to user's org
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true, status: true },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

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
    });

    // Load exception reasons
    const exceptions = await prisma.exceptionReason.findMany({
      where: { evidenceItem: { inspectionId } },
    });

    return NextResponse.json({
      workflow: {
        ...workflow,
        evidenceItems,
        exceptions,
      },
    });
  } catch (error) {
    console.error("[workflow GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = await params;
  const body = await request.json();
  const { jobType, experienceLevel = "APPRENTICE" } = body as {
    jobType: string;
    experienceLevel?: string;
  };

  try {
    // Verify inspection
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

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
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error("[workflow POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const workflow = await prisma.inspectionWorkflow.findUnique({
      where: { inspectionId },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Update step status
    await prisma.workflowStep.update({
      where: { id: stepId },
      data: { status, updatedAt: new Date() },
    });

    // Recalculate workflow totals
    const allSteps = await prisma.workflowStep.findMany({
      where: { workflowId: workflow.id },
      orderBy: { stepOrder: "asc" },
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
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });

    return NextResponse.json({ workflow: updated });
  } catch (error) {
    console.error("[workflow PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
