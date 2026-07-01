import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Returns AuditLog entries for an inspection (most recent first)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await context.params;

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Fetch audit log entries — exclude large change-diff fields
    const entries = await prisma.auditLog.findMany({
      where: { inspectionId: id },
      orderBy: { timestamp: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        device: true,
        userId: true,
        timestamp: true,
      },
    });

    // Resolve user names in a single query
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
      take: userIds.length,
    });
    const userMap: Record<string, string | null> = {};
    for (const u of users) {
      userMap[u.id] = u.name;
    }

    const activity = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      device: entry.device,
      createdAt: entry.timestamp.toISOString(),
      userName: userMap[entry.userId] ?? null,
    }));

    return NextResponse.json({ activity });
  } catch (error) {
    return fromException(request, error, { stage: "inspection:activity" });
  }
}
