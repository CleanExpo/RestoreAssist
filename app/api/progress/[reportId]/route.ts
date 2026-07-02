/**
 * GET /api/progress/[reportId] — Current claim state + last 20 transitions.
 *
 * Board motion M-21 (Sprint 1). See .claude/board-2026-04-18/05-software-architect.md §5.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getState } from "@/lib/progress/service";
import { resolveProgressRole } from "@/lib/progress/permissions";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
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

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 120,
      windowMs: 60 * 1000,
      prefix: "progress:read",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const { reportId } = await params;
    const role = resolveProgressRole({
      userRole: session.user.role ?? "USER",
    });

    const result = await getState(reportId, session.user.id, role);
    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
            ? 403
            : 500;
      return NextResponse.json(
        { error: status === 500 ? "Internal server error" : result.message },
        { status },
      );
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return fromException(request, error, { stage: "get-state" });
  }
}
