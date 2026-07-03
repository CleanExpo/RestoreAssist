/**
 * GET /api/v1/connections/status — launch-readiness manifest (RA-6937).
 *
 * Consumers: external Unite-Group Mission Control / Hermes pollers (primary,
 * via a dedicated bearer token) and signed-in RestoreAssist admins (secondary,
 * via their session). The payload enumerates infra posture, so anonymous
 * callers get a bare 401 with no detail.
 *
 * Auth (either passes):
 *  1. `Authorization: Bearer <CONNECTIONS_STATUS_TOKEN>` — timing-safe
 *     comparison, fail-closed when the env var is unset (lib/cron/auth.ts
 *     pattern, RA-6679).
 *  2. An authenticated ADMIN session, DB-revalidated via verifyAdminFromDb.
 *
 * `?probe=1` opts into cheap live probes (DB SELECT 1, Stripe balance,
 * Resend domains); every check is labelled with its verification `method`.
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  buildRestoreAssistConnectionStatus,
  buildRestoreAssistConnectionStatusWithProbes,
} from "@/lib/connections/status";

export const dynamic = "force-dynamic";

function bearerTokenMatches(request: NextRequest): boolean {
  // Fail CLOSED when the token is unset/empty — otherwise `expected` would be
  // "Bearer " and a caller sending a bare "Bearer " header would pass.
  const token = process.env.CONNECTIONS_STATUS_TOKEN;
  if (!token) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;

  try {
    const a = Buffer.from(authHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    prefix: "connections-status",
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  if (!bearerTokenMatches(request)) {
    // Fall back to an authenticated admin session (DB-revalidated role).
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) {
      // No detail for unauthenticated callers — the manifest is infra posture.
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const probe = request.nextUrl.searchParams.get("probe") === "1";
  const status = probe
    ? await buildRestoreAssistConnectionStatusWithProbes()
    : buildRestoreAssistConnectionStatus();

  return NextResponse.json(status);
}
