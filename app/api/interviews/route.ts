import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - List interview sessions for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
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
    console.error("Error fetching interview sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
