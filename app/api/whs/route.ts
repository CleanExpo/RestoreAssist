import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "CLOSED",
  "REQUIRES_ESCALATION",
] as const;

const createIncidentSchema = z.object({
  incidentType: z.string().trim().min(1).max(200),
  severity: z.enum(SEVERITIES),
  status: z.enum(STATUSES).default("OPEN"),
  incidentDate: z.string().min(1),
  location: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  injuredParty: z.string().trim().max(200).nullable().optional(),
  injuryDescription: z.string().trim().max(5000).nullable().optional(),
  inspectionId: z.string().cuid().nullable().optional(),
});

const actionSelect = {
  id: true,
  incidentId: true,
  description: true,
  assignedTo: true,
  completed: true,
  completedAt: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

const incidentSelect = {
  id: true,
  userId: true,
  incidentType: true,
  severity: true,
  status: true,
  incidentDate: true,
  location: true,
  description: true,
  injuredParty: true,
  injuryDescription: true,
  createdAt: true,
  updatedAt: true,
  correctiveActions: {
    select: actionSelect,
    orderBy: { createdAt: "asc" as const },
    take: 100,
  },
} as const;

function serializeAction(action: {
  id: string;
  incidentId: string;
  description: string;
  assignedTo: string | null;
  completed: boolean;
  completedAt: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: action.id,
    incidentId: action.incidentId,
    description: action.description,
    assignedTo: action.assignedTo,
    // UI treats completedAt as the completion flag; keep both for clarity.
    completed: action.completed,
    completedAt: action.completedAt?.toISOString() ?? null,
    dueDate: action.dueDate?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

function serializeIncident(incident: {
  id: string;
  userId: string;
  incidentType: string;
  severity: string;
  status: string;
  incidentDate: Date;
  location: string | null;
  description: string | null;
  injuredParty: string | null;
  injuryDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  correctiveActions: Array<{
    id: string;
    incidentId: string;
    description: string;
    assignedTo: string | null;
    completed: boolean;
    completedAt: Date | null;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    id: incident.id,
    userId: incident.userId,
    incidentType: incident.incidentType,
    severity: incident.severity,
    status: incident.status,
    incidentDate: incident.incidentDate.toISOString(),
    location: incident.location,
    description: incident.description,
    injuredParty: incident.injuredParty,
    injuryDescription: incident.injuryDescription,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    correctiveActions: incident.correctiveActions.map(serializeAction),
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const incidents = await prisma.wHSIncident.findMany({
      where: { userId: session.user.id },
      select: incidentSelect,
      orderBy: { incidentDate: "desc" },
      take: 200,
    });

    return NextResponse.json({
      incidents: incidents.map(serializeIncident),
    });
  } catch (error) {
    return fromException(request, error, { stage: "list-whs" });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const body = await request.json();
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const data = parsed.data;
    const incidentDate = new Date(data.incidentDate);
    if (Number.isNaN(incidentDate.getTime())) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid incident date",
        status: 400,
      });
    }

    if (data.inspectionId) {
      const inspection = await prisma.inspection.findFirst({
        where: { id: data.inspectionId, userId: session.user.id },
        select: { id: true },
      });
      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }
    }

    const created = await prisma.wHSIncident.create({
      data: {
        userId: session.user.id,
        incidentType: data.incidentType,
        severity: data.severity,
        status: data.status,
        incidentDate,
        location: data.location ?? null,
        description: data.description ?? null,
        injuredParty: data.injuredParty ?? null,
        injuryDescription: data.injuryDescription ?? null,
        inspectionId: data.inspectionId ?? null,
      },
      select: incidentSelect,
    });

    return NextResponse.json(
      { incident: serializeIncident(created) },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "create-whs" });
  }
}
