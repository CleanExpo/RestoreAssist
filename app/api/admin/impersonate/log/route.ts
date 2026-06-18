/**
 * RA-1352 — admin impersonation audit log viewer.
 *
 * GET /api/admin/impersonate/log?limit=50 — ADMIN only.
 * Returns recent impersonation rows with admin + target user details.
 * Supports filtering by admin or target userId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { verifyAdminFromDb } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  // DB-validated admin check — JWT role can be stale (CLAUDE.md rule 3).
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Number.parseInt(searchParams.get("limit") ?? "50", 10),
      200,
    );
    const adminUserId = searchParams.get("adminUserId") ?? undefined;
    const targetUserId = searchParams.get("targetUserId") ?? undefined;

    const where: Record<string, string> = {};
    if (adminUserId) where.adminUserId = adminUserId;
    if (targetUserId) where.targetUserId = targetUserId;

    const rows = await prisma.adminImpersonation.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        admin: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}
