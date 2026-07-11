import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import { dispatchTool } from "@/lib/live-teacher/tools";

/**
 * POST /api/live-teacher/hazard/confirm — RA-1132f-3
 *
 * Writes a WHSIncident that the Live Teacher PROPOSED (flag_whs_hazard) and the
 * technician has now confirmed. Security model:
 *  - The client sends ONLY the proposal's toolCallId. The hazard data is read
 *    from the server-stored proposal row — never trusted from the client.
 *  - The proposal must belong to a Live Teacher session owned by the caller.
 *  - The write goes through the IDOR-guarded dispatchTool (re-checks inspection
 *    tenancy) with source forced to user_reported and the session's real id.
 *  - Idempotent: the proposal is atomically claimed, so a double-confirm cannot
 *    create two incidents.
 */
interface ConfirmBody {
  toolCallId: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;

    const limited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
      prefix: "live-teacher-hazard-confirm",
      key: userId,
    });
    if (limited) return limited;

    let body: ConfirmBody;
    try {
      const parsed = await request.json();
      body = (
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {}
      ) as ConfirmBody;
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON",
        status: 400,
      });
    }
    if (!body.toolCallId || typeof body.toolCallId !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "toolCallId is required",
        status: 400,
      });
    }

    // Load the proposal + its owning session. Ownership is enforced here; the
    // dispatcher re-checks inspection tenancy as defence in depth.
    const proposal = await prisma.teacherToolCall.findUnique({
      where: { id: body.toolCallId },
      select: {
        id: true,
        toolName: true,
        args: true,
        result: true,
        session: { select: { userId: true, inspectionId: true } },
      },
    });
    if (!proposal || proposal.session.userId !== userId) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Proposal not found",
        status: 404,
      });
    }
    if (proposal.toolName !== "flag_whs_hazard") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Not a hazard proposal",
        status: 400,
      });
    }
    const state = (proposal.result ?? {}) as Record<string, unknown>;
    if (state.proposed !== true || state.confirmed === true) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Proposal is not awaiting confirmation",
        status: 409,
      });
    }

    // Atomically claim the proposal so a concurrent double-confirm cannot write
    // two incidents. Only one request flips proposed:true → proposed:false.
    const claim = await prisma.teacherToolCall.updateMany({
      where: { id: proposal.id, result: { path: ["proposed"], equals: true } },
      data: { result: { proposed: false } as Prisma.InputJsonValue },
    });
    if (claim.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Proposal already handled",
        status: 409,
      });
    }

    // Write from the SERVER-stored args, forcing the real inspectionId and
    // source=user_reported (the technician confirmed). Revert the claim if the
    // write fails so the technician can retry.
    const storedArgs = (proposal.args ?? {}) as Record<string, unknown>;
    const hazardArgs = {
      ...storedArgs,
      inspectionId: proposal.session.inspectionId,
      source: "user_reported",
    };

    let incident: { id: string };
    try {
      incident = (await dispatchTool("flag_whs_hazard", hazardArgs, {
        userId,
      })) as { id: string };
    } catch (err) {
      await prisma.teacherToolCall
        .update({
          where: { id: proposal.id },
          data: { result: { proposed: true } as Prisma.InputJsonValue },
        })
        .catch(() => {});
      throw err;
    }

    await prisma.teacherToolCall.update({
      where: { id: proposal.id },
      data: {
        result: {
          proposed: false,
          confirmed: true,
          incidentId: incident.id,
        } as Prisma.InputJsonValue,
      },
    });

    return Response.json({ data: { incidentId: incident.id } }, { status: 201 });
  } catch (error) {
    return fromException(request, error, {
      stage: "live-teacher-hazard-confirm",
    });
  }
}
