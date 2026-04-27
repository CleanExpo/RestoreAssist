/**
 * RA-1349 — client-error sink.
 *
 * Receives unhandled browser exceptions from the client error boundary
 * (app/error.tsx + app/global-error.tsx) and structured-logs them so
 * Vercel Observability indexes them server-side. Without this, client
 * errors only live in the user's browser console — invisible to ops.
 *
 * Deliberately unauthenticated: unhandled exceptions may fire before
 * session is established (login page, public landing). Rate-limited
 * per IP to bound abuse — a malicious actor can't flood the log sink.
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    prefix: "observability:client-error",
    key: getClientIp(request),
  });
  if (rateLimited) return rateLimited;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // Structured log — Vercel Observability indexes this
  console.error(
    "[client-error]",
    JSON.stringify({
      message: body.message ?? "(no message)",
      name: body.name ?? "UnknownError",
      stack: body.stack,
      url: body.url,
      userAgent: body.userAgent,
      ip: getClientIp(request),
      timestamp: new Date().toISOString(),
      ...body,
    }),
  );

  return NextResponse.json({ ok: true });
}
