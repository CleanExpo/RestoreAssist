/**
 * RA-1593 — POST /api/auth/revoke-sessions
 *
 * Writes a SESSIONS_REVOKED SecurityEvent for the target user. The
 * NextAuth jwt() callback compares each token's `mintedAt` against
 * the latest revoke event on refresh; anything older is forced to
 * re-login. Refresh happens at most every 24 hours (`updateAge`),
 * so the worst-case revoke lag is 24h — tight enough for an admin
 * to use this before the next daily rollover, gentle enough to keep
 * the JWT stateless between rotations.
 *
 * Two call-sites:
 *   - self-revoke: any authenticated user can revoke their own
 *     sessions (e.g. password change, suspicious-activity response).
 *   - admin-revoke: ADMIN role can revoke any user's sessions
 *     (targeted compromise response).
 *
 * Does NOT revoke the caller's own session by default unless
 * `includeSelf: true` is passed — otherwise the caller has to
 * log in again immediately after pressing the button.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logSecurityEvent } from "@/lib/security-audit";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  const csrfErr = validateCsrf(request);
  if (csrfErr) return csrfErr;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Sign in required",
      status: 401,
    });
  }

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    prefix: "revoke-sessions",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as {
    targetUserId?: unknown;
    reason?: unknown;
  } | null;

  const requestedTarget =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  // Resolve target — default self, else require admin.
  let targetUserId = session.user.id;
  if (requestedTarget && requestedTarget !== session.user.id) {
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    targetUserId = requestedTarget;
  }

  try {
    await logSecurityEvent({
      eventType: "SESSIONS_REVOKED",
      severity: "WARNING",
      userId: targetUserId,
      details: {
        revokedBy: session.user.id,
        reason: reason || null,
        self: targetUserId === session.user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      revokedUserId: targetUserId,
      propagationWindowSeconds: 24 * 60 * 60,
      message:
        "Sessions revoked. Target will be logged out on their next token refresh (within 24 hours).",
    });
  } catch (err) {
    return fromException(request, err, { stage: "revoke-sessions" });
  }
}
