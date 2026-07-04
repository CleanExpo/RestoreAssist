import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET - List interview sessions for current user
export async function GET(request: NextRequest) {
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

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    // Bound pagination so ?page=-1 or ?limit=1e9 can't force negative skip
    // (Prisma throws) or unbounded/NaN result sets (OOM + runtime-error risk).
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20),
    );
    const skip = (page - 1) * limit;

    const where: any = { userId: user.id };
    if (status) {
      where.status = status;
    }

    // Explicit select (CLAUDE.md rule 4) — excludes heavy @db.Text JSON blobs
    // (answers, autoPopulatedFields, standardsReferences, equipmentRecommendations)
    // that the list view does not render. Detail route returns the full payload.
    const [sessions, total] = await Promise.all([
      prisma.interviewSession.findMany({
        where,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          abandonedAt: true,
          totalQuestionsAsked: true,
          totalAnswersGiven: true,
          estimatedTimeMinutes: true,
          actualTimeMinutes: true,
          userTierLevel: true,
          technicianExperience: true,
          reportId: true,
          createdAt: true,
          updatedAt: true,
          formTemplate: {
            select: { id: true, name: true, formType: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.interviewSession.count({ where }),
    ]);

    return NextResponse.json({
      sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}
