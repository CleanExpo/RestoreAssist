/**
 * GET /api/interviews/[id]/inspection-prefill
 * Returns interview auto-populated fields converted to inspection NIR form prefill shape.
 * Used by inspections/new when opening from a completed interview (sessionId in URL).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { interviewFieldsToInspectionPrefill } from "@/lib/forms/interview-to-inspection-prefill";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;
    if (!id) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Interview ID is required",
        status: 400,
      });
    }

    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true, autoPopulatedFields: true, status: true },
    });

    if (!interviewSession) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Session not found",
        status: 404,
      });
    }

    if (!interviewSession.autoPopulatedFields) {
      return NextResponse.json({ prefill: {} });
    }

    let fields: Record<string, { value: unknown; confidence?: number }>;
    try {
      fields = JSON.parse(interviewSession.autoPopulatedFields) as Record<
        string,
        { value: unknown; confidence?: number }
      >;
    } catch {
      return NextResponse.json({ prefill: {} });
    }

    const prefill = interviewFieldsToInspectionPrefill(fields);
    return NextResponse.json({ prefill });
  } catch (error) {
    return fromException(request, error, { stage: "prefill" });
  }
}
