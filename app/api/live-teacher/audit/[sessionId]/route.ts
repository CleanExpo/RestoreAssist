import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";

// GET — return full utterance + tool call audit trail for a session
// Rule 1: getServerSession required
// Owner-only OR admin (verifyAdminFromDb re-validates from DB per Rule 3)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    // Rule 4: explicit select on session lookup
    const liveSession = await prisma.liveTeacherSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        totalCostAudCents: true,
        jurisdiction: true,
        deviceOs: true,
      },
    });

    if (!liveSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Owner-only OR admin check
    const isOwner = liveSession.userId === session.user.id;

    if (!isOwner) {
      // Try admin path — verifyAdminFromDb re-validates role from DB
      const adminAuth = await verifyAdminFromDb(session);
      if (adminAuth.response) {
        // verifyAdminFromDb returns 401 for unauthed and 403 for non-admin
        // Override to 403 since we already confirmed identity above
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // adminAuth.user is set — proceed as admin
    }

    // Rule 4: explicit select + take limits on child queries
    const utterances = await prisma.teacherUtterance.findMany({
      where: { sessionId },
      select: {
        turnIndex: true,
        role: true,
        content: true,
        clauseRefs: true,
        confidence: true,
        userOverride: true,
        createdAt: true,
      },
      orderBy: { turnIndex: "asc" },
      take: 500,
    });

    const toolCalls = await prisma.teacherToolCall.findMany({
      where: { sessionId },
      select: {
        toolName: true,
        args: true,
        result: true,
        durationMs: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return NextResponse.json({
      data: {
        session: {
          id: liveSession.id,
          startedAt: liveSession.startedAt,
          endedAt: liveSession.endedAt,
          totalCostAudCents: liveSession.totalCostAudCents,
          jurisdiction: liveSession.jurisdiction,
          deviceOs: liveSession.deviceOs,
        },
        utterances,
        toolCalls,
      },
    });
  } catch (error) {
    console.error("[live-teacher/audit GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
