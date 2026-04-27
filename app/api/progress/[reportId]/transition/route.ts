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
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";

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
    maxRequests: 60,
    windowMs: 60 * 1000,
    prefix: "progress:transition",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { reportId } = await params;

  // RA-1266: progress transitions write append-only audit rows and fan
  // out to integrations (M-21). Retry without idempotency double-writes
  // the transition + double-fires downstream events.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: { key?: string; expectedVersion?: number; note?: string };
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      if (!body.key || !TRANSITION_KEYS.includes(body.key as TransitionKey)) {
        return NextResponse.json(
          {
            error: `key must be one of: ${TRANSITION_KEYS.join(", ")}`,
          },
          { status: 400 },
        );
      }

      // RA-1443 / M-16: the Junior Technician ring-fence only fires if
      // we read the per-user flag here and pass it through. Previously
      // `resolveProgressRole` got only `userRole`, so a User.role="USER"
      // with `isJuniorTechnician=true` resolved as TECHNICIAN rather
      // than TECHNICIAN_JUNIOR, silently bypassing `canPerformTransition`.
      const userRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { isJuniorTechnician: true },
      });

      const role = resolveProgressRole({
        userRole: session.user.role ?? "USER",
        isJuniorTechnician: userRow?.isJuniorTechnician ?? false,
      });

      const result = await transition({
        reportId,
        key: body.key as TransitionKey,
        actorUserId: userId,
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
  });
}
