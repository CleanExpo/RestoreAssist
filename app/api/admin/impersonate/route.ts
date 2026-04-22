/**
 * RA-1352 — start admin impersonation session.
 *
 * POST { targetUserId, reason } →
 *   { token, expiresAt, audit: { id, startedAt } }
 *
 * ADMIN-only. Writes an AdminImpersonation audit row + returns a signed,
 * short-lived (30 min) token. Integrating the token into the runtime
 * session (so DB queries act as the target user) is a follow-up ticket
 * gated on security review — this PR ships the audit + token surface.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import {
  IMPERSONATION_TTL_MS,
  issueImpersonationToken,
  serializeToken,
} from "@/lib/admin-impersonation";

export async function POST(request: NextRequest) {
  // RA-1545 — defence-in-depth. Session cookies are SameSite=Lax by
  // default, but impersonation is a high-blast-radius action; adding
  // explicit origin-check removes the "cookie-attached cross-origin POST
  // from a malicious page" edge case. Rate-limit is IP-based; a compromised
  // admin browser can still issue tokens, but flooding is bounded.
  const csrfErr = validateCsrf(request);
  if (csrfErr) return csrfErr;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  // RA-1545 — bound token-mint rate per admin. A genuine support flow issues
  // 1-2 tokens/minute at most; this cap is far above the real workflow but
  // catches compromised admin credentials trying to mint many.
  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    prefix: "admin:impersonate:start",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as {
    targetUserId?: unknown;
    reason?: unknown;
  } | null;

  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  const reason =
    typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!targetUserId) {
    return NextResponse.json(
      { error: "targetUserId is required" },
      { status: 400 },
    );
  }
  if (!reason || reason.length < 8) {
    return NextResponse.json(
      {
        error:
          "reason is required (min 8 chars). Reference a support ticket or incident id.",
      },
      { status: 400 },
    );
  }
  if (targetUserId === session.user.id) {
    return NextResponse.json(
      { error: "Cannot impersonate yourself" },
      { status: 400 },
    );
  }

  // Verify target exists before minting a token for it
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const token = issueImpersonationToken(session.user.id, target.id);
  const expiresAt = new Date(token.expiresAt);
  const ua = request.headers.get("user-agent") ?? null;
  const ip = getClientIp(request);

  const audit = await prisma.adminImpersonation.create({
    data: {
      adminUserId: session.user.id,
      targetUserId: target.id,
      tokenId: token.jti,
      reason,
      ipAddress: ip,
      userAgent: ua,
      expiresAt,
    },
    select: { id: true, startedAt: true },
  });

  // Loud log — every impersonation start shows up in Vercel Observability
  // tagged with the audit id so it's one click to the DB row.
  console.info(
    "[admin-impersonation.start]",
    JSON.stringify({
      auditId: audit.id,
      adminUserId: session.user.id,
      targetUserId: target.id,
      reason,
      ip,
      ttlMs: IMPERSONATION_TTL_MS,
    }),
  );

  return NextResponse.json({
    token: serializeToken(token),
    expiresAt: expiresAt.toISOString(),
    audit: {
      id: audit.id,
      startedAt: audit.startedAt.toISOString(),
      targetEmail: target.email,
    },
  });
}
