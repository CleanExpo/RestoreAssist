/**
 * Retry a FAILED StorageRestoreJob.
 *
 * POST /api/storage/restore/[jobId]/retry
 *   → { data: { retried: boolean } }
 *
 * Auth: only members of the same org may retry.
 * Ownership verified by matching job.orgId against user.organizationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retryRestoreJob } from "@/lib/queue/storage-restore";
import { fromException } from "@/lib/api-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
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

    const { jobId } = await params;
    const job = await prisma.storageRestoreJob.findUnique({
      where: { id: jobId },
      select: { orgId: true, status: true },
    });
    if (!job || job.orgId !== user.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const retried = await retryRestoreJob(jobId);
    return NextResponse.json({ data: { retried } });
  } catch (err) {
    return fromException(_request, err, { stage: "storage-restore/retry:post" });
  }
}
