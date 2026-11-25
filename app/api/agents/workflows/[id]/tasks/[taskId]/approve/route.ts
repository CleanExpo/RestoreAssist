import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { decideApproval } from "@/lib/agents";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// RA-8000: `.strict()` refuses any other key. In particular `approvedBy` is
// never read from the body: the approver is always the session user.
const BodySchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().max(1000).optional(),
  })
  .strict();

/**
 * POST /api/agents/workflows/[id]/tasks/[taskId]/approve — approve or reject
 * a task that is waiting in AWAITING_APPROVAL.
 *
 * The decision runs in one transaction whose first write is a compare-and-swap
 * scoped to the session user's workflow (lib/agents/approval.ts). A task that
 * is not visible to the caller is 404; a visible task in the wrong state is a
 * 409 CONFLICT that names the task and workflow status and the winning decision.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 20,
    windowMs: 60_000,
    prefix: "agent-approve",
  });
  if (rateLimited) return rateLimited;

  const { id: workflowId, taskId } = await params;

  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let json: unknown;
      try {
        json = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Body must be { decision: 'approve' | 'reject', note?: string (at most 1000 characters) } with no other keys",
          status: 400,
        });
      }

      const result = await decideApproval({
        userId,
        workflowId,
        taskId,
        decision: parsed.data.decision,
        note: parsed.data.note,
      });

      if (result.ok) {
        return NextResponse.json({
          workflowId,
          taskId,
          decision: result.decision,
          taskStatus: result.taskStatus,
          workflowStatus: result.workflowStatus,
        });
      }

      if (result.reason === "NOT_FOUND") {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Task not found",
          status: 404,
        });
      }

      const conflict = apiError(request, {
        code: "CONFLICT",
        message: "This task is not waiting for approval",
        status: 409,
        stage: "agents-task-approve",
        fields: {
          taskStatus: result.taskStatus,
          workflowStatus: result.workflowStatus,
          decision: result.decision ?? "none",
        },
      });
      // A conflict describes the moment it was read; a retry with the same key
      // must be evaluated again, not replayed.
      conflict.headers.set("X-RestoreAssist-Idempotency-No-Cache", "true");
      return conflict;
    } catch (error) {
      return fromException(request, error, { stage: "agents-task-approve" });
    }
  });
}
