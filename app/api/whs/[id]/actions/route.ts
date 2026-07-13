import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const createActionSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  assignedTo: z.string().trim().max(200).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: incidentId } = await context.params;

  try {
    const body = await request.json();
    const parsed = createActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const incident = await prisma.wHSIncident.findFirst({
      where: { id: incidentId, userId: session.user.id },
      select: { id: true },
    });
    if (!incident) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Incident not found",
        status: 404,
      });
    }

    let dueDate: Date | null = null;
    if (parsed.data.dueDate) {
      dueDate = new Date(parsed.data.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid due date",
          status: 400,
        });
      }
    }

    const action = await prisma.wHSCorrectiveAction.create({
      data: {
        incidentId,
        description: parsed.data.description,
        assignedTo: parsed.data.assignedTo ?? null,
        dueDate,
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

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "create-whs-action" });
  }
}
