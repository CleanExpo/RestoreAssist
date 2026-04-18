/**
 * POST /api/progress/[reportId]/init — Bootstrap ClaimProgress for a Report.
 *
 * Called automatically by other Progress-aware endpoints when a report first
 * transitions to a state that warrants Progress tracking. Idempotent — returns
 * 409 ALREADY_EXISTS if a ClaimProgress row is already present.
 *
 * Board motion M-21 (Sprint 1).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { init } from "@/lib/progress/service";
import { resolveProgressRole } from "@/lib/progress/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 60 * 1000,
      prefix: "progress:init",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const { reportId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      inspectionId?: string;
    };

    const role = resolveProgressRole({
      userRole: session.user.role ?? "USER",
    });

    const result = await init({
      reportId,
      actorUserId: session.user.id,
      actorRole: role,
      actorName: session.user.name ?? session.user.email ?? "unknown",
      inspectionId: body.inspectionId ?? null,
    });

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
            ? 403
            : result.code === "ALREADY_EXISTS"
              ? 409
              : 500;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    console.error("[progress.init] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
