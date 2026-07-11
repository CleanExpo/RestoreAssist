import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import {
  invokeClaudeCloud,
  type TeacherTurn,
} from "@/lib/live-teacher/claude-cloud";
import { buildTeacherContext } from "@/lib/live-teacher/build-teacher-context";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// POST — stream an SSE response for a user utterance turn
// Rule 1: getServerSession required
// Rule 10: rate-limit 120 req/min keyed on session.user.id

interface TurnBody {
  sessionId: string;
  utterance: string;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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

  // Rule 10: rate-limit 120 req/min per user
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 120,
    windowMs: 60_000,
    key: session.user.id,
    prefix: "live-teacher-turn",
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
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
    // RA-1548 — left raw: rich 402 with `upgradeRequired` sibling the client
    // reads to drive the upgrade CTA; the envelope has no slot for it.
    return new Response(
      JSON.stringify({
        error: "Active subscription required for Live Teacher",
        upgradeRequired: true,
      }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  // RA-6963 (BYOK, P1) — Live Teacher is a customer AI workload; resolve the
  // workspace's own Anthropic key after the subscription gate and pass it into
  // invokeClaudeCloud. Never spend the platform ANTHROPIC_API_KEY. On no key,
  // return the 402 NoWorkspaceKeyError shape (chatbot sibling pattern).
  let workspaceKey: { workspaceId: string; apiKey: string };
  try {
    workspaceKey = await resolveWorkspaceAiKey(session.user.id, "ANTHROPIC");
  } catch (err) {
    if (err instanceof NoWorkspaceKeyError) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: err.message,
        status: 402,
      });
    }
    return fromException(request, err, { stage: "turn-key" });
  }

  let body: TurnBody;
  try {
    const parsed = await request.json();
    body = (
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {}
    ) as TurnBody;
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  if (!body.sessionId || !body.utterance?.trim()) {
    return apiError(request, {
      code: "VALIDATION",
      message: "sessionId and utterance are required",
      status: 400,
    });
  }

  // Verify session ownership (Rule 4: explicit select)
  const liveSession = await prisma.liveTeacherSession.findFirst({
    where: { id: body.sessionId, userId: session.user.id },
    select: { id: true, userId: true, inspectionId: true, jurisdiction: true },
  });

  if (!liveSession) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Session not found",
      status: 404,
    });
  }

  // True turn count drives turnIndex — count() returns a number, not a row set,
  // so it is safe regardless of session length.
  const turnCount = await prisma.teacherUtterance.count({
    where: { sessionId: body.sessionId },
  });

  // Load only the most recent turns for the model conversation history. Bounding
  // this caps context size and AI cost on long sessions; the current utterance
  // is appended by invokeClaudeCloud's message builder. (Rule 4: explicit select.)
  const RECENT_TURN_LIMIT = 40; // ~20 exchanges of context
  const recentTurns = await prisma.teacherUtterance.findMany({
    where: { sessionId: body.sessionId },
    orderBy: { turnIndex: "desc" },
    take: RECENT_TURN_LIMIT,
    select: { role: true, content: true, clauseRefs: true },
  });
  recentTurns.reverse(); // restore chronological order for the model
  const history: TeacherTurn[] = recentTurns.map((turn) => ({
    role: turn.role as TeacherTurn["role"],
    content: turn.content,
    clauseRefs: turn.clauseRefs,
  }));

  // Derive the teaching context from real inspection data — current room, the
  // furthest-reached S500 stage, and the gaps a veteran would still close — so
  // the coach guides against where the technician actually is, not generic
  // defaults. Resilient: a missing inspection yields safe defaults.
  const context = await buildTeacherContext(
    liveSession.inspectionId,
    session.user.id,
    liveSession.jurisdiction === "NZ" ? "NZ" : "AU",
  );

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

        // Get assistant response from the real cloud client (RA-6731).
        // invokeClaudeCloud handles its own API errors (Rule 7) and returns a
        // safe fallback rather than throwing.
        const result = await invokeClaudeCloud({
          sessionId: body.sessionId,
          context,
          history,
          userUtterance: body.utterance.trim(),
          apiKey: workspaceKey.apiKey,
        });

        // invokeClaudeCloud grades confidence 0–100; TeacherUtterance.confidence
        // is a 0..1 Float, so normalise before persisting/streaming.
        const confidence = result.confidence / 100;

        // Persist assistant turn first so tool-call rows can link to it.
        const assistantUtterance = await prisma.teacherUtterance.create({
          data: {
            sessionId: body.sessionId,
            turnIndex: turnCount + 1,
            role: "assistant",
            content: result.content,
            clauseRefs: result.clauseRefs,
            confidence,
          },
          select: { id: true },
        });

        // RA-1132f — persist each tool call and stream an event so the client
        // can show what the teacher did. Emitted before the token so the
        // narrative reads act-then-summarise. Forward-compatible: a client that
        // only handles token/done/error ignores these event types.
        for (const call of result.toolCalls) {
          // RA-1132f-3 — a confirm-required PROPOSAL (e.g. flag_whs_hazard) is
          // NOT executed: persist an audit row marked proposed (no compliance
          // write) and emit a tool_proposal event for the tech to confirm.
          if (call.proposed) {
            const row = await prisma.teacherToolCall.create({
              data: {
                sessionId: body.sessionId,
                utteranceId: assistantUtterance.id,
                toolName: call.name,
                args: (call.args ?? {}) as Prisma.InputJsonValue,
                result: { proposed: true } as Prisma.InputJsonValue,
              },
              select: { id: true },
            });
            controller.enqueue(
              encoder.encode(
                sseEvent({
                  type: "tool_proposal",
                  id: row.id,
                  toolName: call.name,
                  args: call.args ?? {},
                }),
              ),
            );
            continue;
          }

          const row = await prisma.teacherToolCall.create({
            data: {
              sessionId: body.sessionId,
              utteranceId: assistantUtterance.id,
              toolName: call.name,
              args: (call.args ?? {}) as Prisma.InputJsonValue,
              error: call.error,
              durationMs: call.durationMs,
              ...(call.error === undefined && call.result !== undefined
                ? { result: call.result as Prisma.InputJsonValue }
                : {}),
            },
            select: { id: true },
          });
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "tool_call",
                id: row.id,
                toolName: call.name,
                ok: call.error === undefined,
                result: call.result ?? null,
                error: call.error ?? null,
              }),
            ),
          );
        }

        // Stream content as a single token event (non-streaming client).
        controller.enqueue(
          encoder.encode(sseEvent({ type: "token", content: result.content })),
        );

        // Stream done event
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "done",
              utteranceId: assistantUtterance.id,
              clauseRefs: result.clauseRefs,
              confidence,
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
