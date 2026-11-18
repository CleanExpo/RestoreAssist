/**
 * SP-E: Retry a FAILED or DEAD_LETTER StorageMirrorJob.
 *
 * POST /api/storage/mirror-jobs/retry/[jobId]
 *   → 200 { data: { retried: true } }
 *   → 409 { error } when the job was not FAILED or DEAD_LETTER (RA-8451:
 *     a no-op used to answer 200 and the table showed it as queued)
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
    const job = await prisma.storageMirrorJob.findUnique({
      where: { id: jobId },
      select: { orgId: true, status: true },
    });
    if (!job || job.orgId !== user.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const retried = await retryJob(jobId);
    if (!retried) {
      return NextResponse.json(
        {
          error:
            "This job is no longer waiting for a retry. Refresh the list to see its current status.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: { retried } });
  } catch (err) {
    return fromException(_request, err, { stage: "mirror-jobs/retry:post" });
  }
}
