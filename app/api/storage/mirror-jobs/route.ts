/**
 * SP-E: List the StorageMirrorJob queue for the caller's org.
 *
 * GET /api/storage/mirror-jobs?limit=50
 *   → { data: { jobs: [...], stats: {...} } }
 *
 * Auth: session user must own / be a member of the org. We resolve the
 * org via `User.organizationId`. Cross-org enumeration is impossible.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMirrorQueueStats } from "@/lib/queue/storage-mirror";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? "50"), 1),
    200,
  );

  const [jobs, stats] = await Promise.all([
    prisma.storageMirrorJob.findMany({
      where: { orgId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        status: true,
        filename: true,
        attempts: true,
        lastError: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
        completedAt: true,
        createdAt: true,
        driveViewUrl: true,
      },
    }),
    getMirrorQueueStats(user.organizationId),
  ]);

  return NextResponse.json({ data: { jobs, stats } });
}
