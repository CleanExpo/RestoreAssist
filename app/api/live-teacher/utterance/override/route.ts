import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/live-teacher/utterance/override — RA-1132i-3
 *
 * Marks a Live Teacher assistant answer as overridden by the technician, with a
 * reason (epic decision #8 — insurer-visible footnote). Tenancy: the utterance's
 * session must be owned by the caller. Only assistant utterances are overridable.
 */
interface OverrideBody {
  utteranceId: string;
  reason: string;
}

const MAX_REASON_LEN = 2000;

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
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
      prefix: "live-teacher-override",
      key: userId,
    });
    if (limited) return limited;

    let body: OverrideBody;
    try {
      const parsed = await request.json();
      body = (
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {}
      ) as OverrideBody;
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON",
        status: 400,
      });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!body.utteranceId || typeof body.utteranceId !== "string" || !reason) {
      return apiError(request, {
        code: "VALIDATION",
        message: "utteranceId and a reason are required",
        status: 400,
      });
    }

    // Tenancy: the utterance's session must be owned by the caller.
    const utterance = await prisma.teacherUtterance.findUnique({
      where: { id: body.utteranceId },
      select: { id: true, role: true, session: { select: { userId: true } } },
    });
    if (!utterance || utterance.session.userId !== userId) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Utterance not found",
        status: 404,
      });
    }
    if (utterance.role !== "assistant") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Only the teacher's answers can be overridden",
        status: 400,
      });
    }

    await prisma.teacherUtterance.update({
      where: { id: utterance.id },
      data: { userOverride: true, overrideReason: reason.slice(0, MAX_REASON_LEN) },
    });

    return Response.json({ data: { overridden: true } }, { status: 200 });
  } catch (error) {
    return fromException(request, error, {
      stage: "live-teacher-utterance-override",
    });
  }
}
