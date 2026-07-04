/**
 * Cron-failure observability — admin read surface over CronJobRun.
 *
 * lib/cron/runner.ts writes a CronJobRun row on every cron run (including
 * failures) but nothing reads it — ops finds out about cron failures only
 * by manually looking. This route exposes recent runs, most-recent first,
 * with an optional `?status=` filter and a failed-count summary so a human
 * can see failures at a glance without cross-referencing logs.
 *
 * CronJobRun is a global operational table (jobName like "process-emails",
 * "cleanup" — not scoped to a tenant), so unlike most admin routes there is
 * no organizationId to scope by; verifyAdminFromDb's DB-revalidated ADMIN
 * check is the access control here.
 *
 * No schema change — CronJobRun already exists (prisma/schema.prisma).
 * No external alerting (Slack/Resend) — that needs an owner-supplied
 * endpoint and is out of scope for this read surface.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";

// Matches the status values runCronJob() actually persists
// (lib/cron/runner.ts) — "running" while in flight, then "completed" or
// "failed". ("skipped" is returned to the caller on overlap-guard but is
// never written to CronJobRun, so it is not a valid filter value here.)
const VALID_STATUSES = ["running", "completed", "failed"] as const;
type CronRunStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: string | null): value is CronRunStatus {
  return (
    value !== null && (VALID_STATUSES as readonly string[]).includes(value)
  );
}

// GET — recent CronJobRun rows, most-recent first, with a failed-count
// summary. Supports `?status=failed` (or running/completed) and `?limit=`.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Re-validates role from DB to prevent stale JWT role from granting admin access
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get("status");
    const where = isValidStatus(statusParam) ? { status: statusParam } : {};

    // Bound the result set (CLAUDE.md rule 3) — cap 100, default 50.
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
    );

    const [runs, total, failedCount] = await Promise.all([
      prisma.cronJobRun.findMany({
        where,
        take: limit,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          jobName: true,
          status: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          errorMessage: true,
          itemsProcessed: true,
        },
      }),
      prisma.cronJobRun.count({ where }),
      // Unfiltered failed-count summary — always reflects total failures,
      // independent of the ?status filter, so it stays a glance-able signal.
      prisma.cronJobRun.count({ where: { status: "failed" } }),
    ]);

    return NextResponse.json({ runs, total, failedCount, limit });
  } catch (err) {
    return fromException(request, err, { stage: "admin/cron-runs:list" });
  }
}
