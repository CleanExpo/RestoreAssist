/**
 * SP-E: Retry a FAILED StorageMirrorJob.
 *
 * POST /api/storage/mirror-jobs/retry/[jobId]
 *   → { data: { retried: boolean } }
 *
 * Auth: only the org owner or members of the same org may retry.
 * We verify by re-reading the job's orgId and matching against the
 * caller's `User.organizationId`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retryJob } from "@/lib/queue/storage-mirror";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
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
  const job = await prisma.storageMirrorJob.findUnique({
    where: { id: jobId },
    select: { orgId: true, status: true },
  });
  if (!job || job.orgId !== user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const retried = await retryJob(jobId);
  return NextResponse.json({ data: { retried } });
}
