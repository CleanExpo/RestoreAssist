import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";

// POST — stream an SSE response for a user utterance turn
// Rule 1: getServerSession required
// Rule 10: rate-limit 120 req/min keyed on session.user.id

interface TurnBody {
  sessionId: string;
  utterance: string;
}

interface HandleTurnResult {
  content: string;
  clauseRefs: string[];
  confidence: number;
}

/**
 * Stub AI handler — returns a placeholder response.
 * TODO RA-1132g: wire to lib/live-teacher/claude-cloud.ts once merged
 */
async function handleTurn(): Promise<HandleTurnResult> {
  return {
    content: "Acknowledged. (Live Teacher cloud client lands in RA-1132g.)",
    clauseRefs: [],
    confidence: 0.5,
  };
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rule 10: rate-limit 120 req/min per user
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 120,
    windowMs: 60_000,
    key: session.user.id,
    prefix: "live-teacher-turn",
  });
  if (rateLimited) return rateLimited;

  // RA-1280 / CLAUDE.md rule 8: subscription gate. Live Teacher is the
  // single most expensive AI path (streaming, long turns). Without this
  // gate, CANCELED / PAST_DUE users could drive uncapped Anthropic spend.
  const subUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, lifetimeAccess: true },
  });
  const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE"];
  const hasAccess =
    ALLOWED_SUBSCRIPTION_STATUSES.includes(subUser?.subscriptionStatus ?? "") ||
    subUser?.lifetimeAccess === true;
  if (!hasAccess) {
    return new Response(
      JSON.stringify({
        error: "Active subscription required for Live Teacher",
        upgradeRequired: true,
      }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: TurnBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.sessionId || !body.utterance?.trim()) {
    return new Response(
      JSON.stringify({ error: "sessionId and utterance are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify session ownership (Rule 4: explicit select)
  const liveSession = await prisma.liveTeacherSession.findFirst({
    where: { id: body.sessionId, userId: session.user.id },
    select: { id: true, userId: true },
  });

  if (!liveSession) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Count existing turns for turnIndex (Rule 4: explicit select)
  const turnCount = await prisma.teacherUtterance.count({
    where: { sessionId: body.sessionId },
  });

  // SSE streaming via ReadableStream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Persist user turn
        await prisma.teacherUtterance.create({
          data: {
            sessionId: body.sessionId,
            turnIndex: turnCount,
            role: "user",
            content: body.utterance.trim(),
            clauseRefs: [],
          },
          select: { id: true },
        });

        // Get assistant response (stubbed)
        const result = await handleTurn();

        // Stream content as token events (single chunk for stub)
        controller.enqueue(
          encoder.encode(sseEvent({ type: "token", content: result.content })),
        );

        // Persist assistant turn
        const assistantUtterance = await prisma.teacherUtterance.create({
          data: {
            sessionId: body.sessionId,
            turnIndex: turnCount + 1,
            role: "assistant",
            content: result.content,
            clauseRefs: result.clauseRefs,
            confidence: result.confidence,
          },
          select: { id: true },
        });

        // Stream done event
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "done",
              utteranceId: assistantUtterance.id,
              clauseRefs: result.clauseRefs,
            }),
          ),
        );
      } catch (error) {
        console.error("[live-teacher/turn POST stream]", error);
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message: "Stream error" })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
