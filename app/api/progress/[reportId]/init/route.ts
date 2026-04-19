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
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    prefix: "progress:init",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: layered with the 409 ALREADY_EXISTS guard — catches retries
  // in the TOCTOU window before the first init commits.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const { reportId } = await params;
      let body: { inspectionId?: string } = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        body = {};
      }

      const role = resolveProgressRole({
        userRole: session.user.role ?? "USER",
      });

      const result = await init({
        reportId,
        actorUserId: userId,
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
  });
}
