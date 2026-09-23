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
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveProgressAuthority } from "../_authority";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

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
        const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : {};
        if (
          typeof parsedBody !== "object" ||
          parsedBody === null ||
          Array.isArray(parsedBody)
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: "JSON body must be an object",
            status: 400,
          });
        }
        body = parsedBody as {
          key?: string;
          expectedVersion?: number;
          note?: string;
        };
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      if (!body.key || !TRANSITION_KEYS.includes(body.key as TransitionKey)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `key must be one of: ${TRANSITION_KEYS.join(", ")}`,
          status: 400,
        });
      }

      const authority = await resolveProgressAuthority(session, reportId);
      if (!authority.ok) {
        return apiError(request, {
          code: authority.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
          message: authority.reason,
          status: authority.status,
        });
      }

      const result = await transition({
        reportId,
        key: body.key as TransitionKey,
        actorUserId: userId,
        actorRole: authority.role,
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
          {
            error: status === 500 ? "Internal server error" : result.message,
            code: result.code,
          },
          { status },
        );
      }
      return NextResponse.json({ data: result.data });
    } catch (error) {
      return fromException(request, error, { stage: "transition" });
    }
  });
}
