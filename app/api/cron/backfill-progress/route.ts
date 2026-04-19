/**
 * GET /api/cron/backfill-progress — Create ClaimProgress rows for existing
 * Reports that don't yet have one. Idempotent — safe to run repeatedly.
 *
 * Board motion M-20 (Principal-amended): inferred state gets
 * `managerReviewRequired=true` so a human confirms in 1-click before
 * treating it as canonical. Never silent state assignment.
 *
 * Status mapping (Report.status → ClaimState):
 *   DRAFT      → INTAKE                 (review required)
 *   PENDING    → INTAKE                 (review required)
 *   APPROVED   → SCOPE_APPROVED         (review required)
 *   COMPLETED  → CLOSEOUT               (review required)
 *   ARCHIVED   → CLOSED                 (no review — already terminal)
 *
 * The manager confirms via the Progress dashboard UI (PC2 delivery).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import type { ClaimState, ReportStatus } from "@prisma/client";

const BATCH_SIZE = 500;

function inferInitialState(status: ReportStatus): {
  state: ClaimState;
  needsReview: boolean;
} {
  switch (status) {
    case "DRAFT":
    case "PENDING":
      return { state: "INTAKE", needsReview: true };
    case "APPROVED":
      return { state: "SCOPE_APPROVED", needsReview: true };
    case "COMPLETED":
      return { state: "CLOSEOUT", needsReview: true };
    case "ARCHIVED":
      return { state: "CLOSED", needsReview: false };
    default:
      return { state: "INTAKE", needsReview: true };
  }
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("backfill-progress", async () => {
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const stateDistribution: Record<string, number> = {};

    // Paginate through Reports that have no ClaimProgress yet. Using a
    // left-join-style filter via `where: { claimProgress: { is: null } }`
    // (Prisma v5+ supports this on 1-1 relations).
    let lastId: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch: Array<{ id: string; status: ReportStatus }> =
        await prisma.report.findMany({
          where: {
            claimProgress: { is: null },
            ...(lastId ? { id: { gt: lastId } } : {}),
          },
          select: { id: true, status: true },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
        });
      if (batch.length === 0) break;
      lastId = batch[batch.length - 1].id;

      for (const report of batch) {
        const { state, needsReview } = inferInitialState(report.status);
        stateDistribution[state] = (stateDistribution[state] ?? 0) + 1;

        try {
          await prisma.claimProgress.create({
            data: {
              reportId: report.id,
              currentState: state,
              version: 0,
              managerReviewRequired: needsReview,
              managerReviewRequiredAt: needsReview ? new Date() : null,
              ...(state === "CLOSED" ? { closedAt: new Date() } : {}),
            },
          });
          created++;
        } catch (err) {
          // Likely a race with a concurrent init() call — skip and continue.
          // Any genuine failure is counted and surfaced in metadata.
          if (
            err instanceof Error &&
            (err.message.includes("P2002") ||
              err.message.includes("Unique constraint"))
          ) {
            skipped++;
          } else {
            errors++;
            console.error(
              "[backfill-progress] create failed for report",
              report.id,
              err,
            );
          }
        }
      }

      // Small break if we've processed the full batch in this run — keeps
      // cron runtime bounded on very large databases.
      if (batch.length < BATCH_SIZE) break;
    }

    return {
      itemsProcessed: created,
      metadata: {
        created,
        skipped,
        errors,
        stateDistribution,
      },
    };
  });

  return NextResponse.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
