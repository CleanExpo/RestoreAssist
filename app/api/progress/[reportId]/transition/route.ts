/**
 * POST /api/progress/[reportId]/transition — Advance claim state.
 *
 * Body:
 *   {
 *     key: TransitionKey,
 *     expectedVersion?: number,  // optimistic lock — reject if stale
 *     note?: string
 *   }
 *
 * Board motion M-21 (Sprint 1). Guard functions fleshed out in M-2 follow-up.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { getClientIp } from "@/lib/rate-limiter";
import { transition, TRANSITION_KEYS } from "@/lib/progress/service";
import type { TransitionKey } from "@/lib/progress/service";
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
      maxRequests: 60,
      windowMs: 60 * 1000,
      prefix: "progress:transition",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const { reportId } = await params;
    let body: { key?: string; expectedVersion?: number; note?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.key || !TRANSITION_KEYS.includes(body.key as TransitionKey)) {
      return NextResponse.json(
        {
          error: `key must be one of: ${TRANSITION_KEYS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const role = resolveProgressRole({
      userRole: session.user.role ?? "USER",
    });

    const result = await transition({
      reportId,
      key: body.key as TransitionKey,
      actorUserId: session.user.id,
      actorRole: role,
      actorName: session.user.name ?? session.user.email ?? "unknown",
      actorIp: getClientIp(request),
      note: body.note ?? null,
      expectedVersion: body.expectedVersion,
    });

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
            ? 403
            : result.code === "STALE_VERSION"
              ? 409
              : result.code === "INVALID_TRANSITION" ||
                  result.code === "GUARD_FAILED"
                ? 400
                : 500;
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status },
      );
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[progress.transition] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
