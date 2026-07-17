import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "CLOSED",
  "REQUIRES_ESCALATION",
] as const;

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  location: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  injuredParty: z.string().trim().max(200).nullable().optional(),
  injuryDescription: z.string().trim().max(5000).nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id } = await context.params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const existing = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Incident not found",
        status: 404,
      });
    }

    const updated = await prisma.wHSIncident.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
        ...(parsed.data.severity !== undefined
          ? { severity: parsed.data.severity }
          : {}),
        ...(parsed.data.location !== undefined
          ? { location: parsed.data.location }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.injuredParty !== undefined
          ? { injuredParty: parsed.data.injuredParty }
          : {}),
        ...(parsed.data.injuryDescription !== undefined
          ? { injuryDescription: parsed.data.injuryDescription }
          : {}),
      },
      select: {
        id: true,
        status: true,
        severity: true,
        location: true,
        description: true,
        injuredParty: true,
        injuryDescription: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      incident: {
        ...updated,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "patch-whs" });
  }
}
