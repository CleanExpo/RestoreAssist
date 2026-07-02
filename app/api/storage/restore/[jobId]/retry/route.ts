/**
 * Retry a FAILED StorageRestoreJob.
 *
 * POST /api/storage/restore/[jobId]/retry
 *   → { data: { retried: boolean } }
 *
 * Auth: org owner only (same ownership gate as the parent restore routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retryRestoreJob } from "@/lib/queue/storage-restore";
import { apiError, fromException } from "@/lib/api-errors";
import { requireOwner } from "@/app/api/storage/restore/route";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth.error;

    const { jobId } = await params;
    const job = await prisma.storageRestoreJob.findUnique({
      where: { id: jobId },
      select: { orgId: true },
    });
    if (!job || job.orgId !== auth.orgId) {
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    const retried = await retryRestoreJob(jobId);
    return NextResponse.json({ data: { retried } });
  } catch (err) {
    return fromException(_request, err, {
      stage: "storage-restore/retry:post",
    });
  }
}
