/**
 * RA-1352 — stop admin impersonation.
 *
 * POST { jti } → marks the AdminImpersonation row ended + logs.
 * Called when the admin explicitly ends the session. A cron (future)
 * sweeps expired-but-unended rows so endedAt is never null on rows
 * past their expiresAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { jti?: unknown } | null;
  const jti = typeof body?.jti === "string" ? body.jti.trim() : "";
  if (!jti) {
    return NextResponse.json({ error: "jti is required" }, { status: 400 });
  }

  const row = await prisma.adminImpersonation.findUnique({
    where: { tokenId: jti },
    select: { id: true, adminUserId: true, endedAt: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (row.adminUserId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the originating admin can end this session" },
      { status: 403 },
    );
  }
  if (row.endedAt) {
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  await prisma.adminImpersonation.update({
    where: { id: row.id },
    data: { endedAt: new Date(), endReason: "manual" },
  });

  console.info(
    "[admin-impersonation.stop]",
    JSON.stringify({ auditId: row.id, adminUserId: session.user.id, jti }),
  );

  return NextResponse.json({ ok: true });
}
