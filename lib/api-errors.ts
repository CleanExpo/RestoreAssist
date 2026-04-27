/**
 * RA-1548 — unified API error envelope.
 *
 * Replaces the ad-hoc `NextResponse.json({ error: "..." }, { status: 500 })`
 * pattern with a single helper that:
 *
 *   1. Emits a consistent envelope: `{ error: { code, message, eventId? } }`
 *      so clients can switch on `code` without parsing English strings.
 *   2. Calls `reportError` with route + stage + context in one place — no
 *      more routes silently dropping the error on the floor (RA-1547).
 *   3. Maps well-known Prisma error codes (P2002 unique, P2025 not-found,
 *      P2003 FK) to the correct HTTP status (RA-1554), so "record not
 *      found" doesn't collapse into a 500.
 *
 * Callers:
 *
 *   return apiError(request, { code: "VALIDATION", message: "...", status: 400 });
 *   return apiError(request, { code: "NOT_FOUND", message: "...", status: 404 });
 *   return apiError(request, { code: "INTERNAL", message: "...", err, stage: "update" });
 *
 * For unexpected exceptions wrap in `try/catch` and use `fromException`
 * which does the Prisma mapping automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { reportError, type ErrorContext } from "@/lib/observability";

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_FAILED"
  | "INTERNAL";

export interface ApiErrorInput {
  code: ApiErrorCode;
  message: string;
  status: number;
  /** Raw exception (optional) — logged via reportError for Observability. */
  err?: unknown;
  /** Logical stage in the handler (e.g. "load", "update", "sync"). */
  stage?: string;
  /** Extra structured context for the log line. */
  context?: Record<string, unknown>;
  /** Optional per-field validation details echoed to the client (422). */
  fields?: Record<string, string>;
}

function newEventId(): string {
  // Short correlation id: good enough to pair a log line with a user
  // complaint ("Error ID abc123"). Not cryptographically random — this
  // is an observability tag, not a secret.
  return Math.random().toString(36).slice(2, 10);
}

function routeFromRequest(req?: NextRequest): string | undefined {
  if (!req) return undefined;
  try {
    return new URL(req.url).pathname;
  } catch {
    return undefined;
  }
}

export function apiError(
  request: NextRequest | undefined,
  input: ApiErrorInput,
): NextResponse {
  const eventId = newEventId();
  const route = routeFromRequest(request);

  // Only call reportError for 5xx and unexpected UPSTREAM_FAILED — 4xx
  // are expected client errors and would drown the observability feed.
  const shouldReport =
    input.status >= 500 || input.code === "UPSTREAM_FAILED";

  if (shouldReport || input.err) {
    reportError(input.err ?? new Error(input.message), {
      route,
      stage: input.stage,
      code: input.code,
      status: input.status,
      eventId,
      ...(input.context ?? {}),
    } satisfies ErrorContext);
  }

  return NextResponse.json(
    {
      error: {
        code: input.code,
        message: input.message,
        eventId,
        ...(input.fields ? { fields: input.fields } : {}),
      },
    },
    { status: input.status },
  );
}

/**
 * Convert an exception thrown from a handler into a standardised error
 * response. Handles the common Prisma known-request-error cases.
 */
export function fromException(
  request: NextRequest | undefined,
  err: unknown,
  opts: { stage?: string; context?: Record<string, unknown> } = {},
): NextResponse {
  // Prisma surfaces known errors with a `code` string (e.g. "P2025").
  // We don't import @prisma/client/runtime/library at the top level to
  // keep this helper usable in edge runtimes; instead duck-type.
  const prismaCode =
    typeof err === "object" && err !== null && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;

  if (prismaCode === "P2025") {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Record not found",
      status: 404,
      err,
      stage: opts.stage,
      context: opts.context,
    });
  }

  if (prismaCode === "P2002") {
    return apiError(request, {
      code: "CONFLICT",
      message: "A record with these unique fields already exists",
      status: 409,
      err,
      stage: opts.stage,
      context: opts.context,
    });
  }

  if (prismaCode === "P2003") {
    return apiError(request, {
      code: "CONFLICT",
      message: "Foreign key constraint failed — related record missing",
      status: 409,
      err,
      stage: opts.stage,
      context: opts.context,
    });
  }

  return apiError(request, {
    code: "INTERNAL",
    message: "Internal server error",
    status: 500,
    err,
    stage: opts.stage,
    context: opts.context,
  });
}
