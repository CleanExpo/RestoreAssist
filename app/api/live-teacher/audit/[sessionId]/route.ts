import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import {
  buildCorpusIndex,
  collectDistinctPairs,
  classifyRefs,
} from "@/lib/live-teacher/citation-validity";

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
      return apiError(_request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
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
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "Session not found",
        status: 404,
      });
    }

    // Owner-only OR admin check
    const isOwner = liveSession.userId === session.user.id;

    if (!isOwner) {
      // Try admin path — verifyAdminFromDb re-validates role from DB
      const adminAuth = await verifyAdminFromDb(session);
      if (adminAuth.response) {
        // verifyAdminFromDb returns 401 for unauthed and 403 for non-admin
        // Override to 403 since we already confirmed identity above
        return apiError(_request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
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

    // RA-7053: classify each assistant utterance's clause refs against the
    // corpus via ONE session-scoped lookup (reuses the Part-2 parser).
    const assistantRefs = utterances
      .filter((u) => u.role === "assistant")
      .flatMap((u) => u.clauseRefs);
    const pairs = collectDistinctPairs(assistantRefs);
    const corpusRows =
      pairs.length > 0
        ? await prisma.standardsChunk.findMany({
            where: {
              OR: pairs.map((p) => ({
                standard: p.standard,
                clause: p.clause,
              })),
            },
            select: { standard: true, edition: true, clause: true },
            take: pairs.length,
          })
        : [];
    const corpus = buildCorpusIndex(corpusRows);
    const utterancesWithVerdicts = utterances.map((u) => ({
      ...u,
      citationVerdicts:
        u.role === "assistant" ? classifyRefs(u.clauseRefs, corpus) : [],
    }));

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
        utterances: utterancesWithVerdicts,
        toolCalls,
      },
    });
  } catch (error) {
    return fromException(_request, error, { stage: "audit" });
  }
}
