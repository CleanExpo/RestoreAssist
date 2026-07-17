import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const patchActionSchema = z.object({
  completed: z.boolean().optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  assignedTo: z.string().trim().max(200).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string; actionId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: incidentId, actionId } = await context.params;

  try {
    const body = await request.json();
    const parsed = patchActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const existing = await prisma.wHSCorrectiveAction.findFirst({
      where: {
        id: actionId,
        incidentId,
        incident: { userId: session.user.id },
      },
      select: { id: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Corrective action not found",
        status: 404,
      });
    }

    let dueDate: Date | null | undefined = undefined;
    if (parsed.data.dueDate !== undefined) {
      if (parsed.data.dueDate === null || parsed.data.dueDate === "") {
        dueDate = null;
      } else {
        dueDate = new Date(parsed.data.dueDate);
        if (Number.isNaN(dueDate.getTime())) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Invalid due date",
            status: 400,
          });
        }
      }
    }

    const completedAt =
      parsed.data.completed === undefined
        ? undefined
        : parsed.data.completed
          ? new Date()
          : null;

    const action = await prisma.wHSCorrectiveAction.update({
      where: { id: actionId },
      data: {
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.assignedTo !== undefined
          ? { assignedTo: parsed.data.assignedTo }
          : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(parsed.data.completed !== undefined
          ? { completed: parsed.data.completed, completedAt }
          : {}),
      },
      select: {
        id: true,
        incidentId: true,
        description: true,
        assignedTo: true,
        completed: true,
        completedAt: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      action: {
        id: action.id,
        incidentId: action.incidentId,
        description: action.description,
        assignedTo: action.assignedTo,
        completed: action.completed,
        completedAt: action.completedAt?.toISOString() ?? null,
        dueDate: action.dueDate?.toISOString() ?? null,
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "patch-whs-action" });
  }
}
