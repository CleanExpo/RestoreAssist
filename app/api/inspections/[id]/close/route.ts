/**
 * POST /api/inspections/[id]/close
 *
 * Terminal-state transition for an inspection. Atomically:
 *   1. Re-validates the close preconditions (canTransition).
 *   2. CAS-updates Inspection.status IN_BILLING → CLOSED.
 *   3. Writes append-only ProgressTransition + AuditLog rows.
 *
 * Returns 200 on success and fires SP-E's `exportClosedJobToBYOKStorage`
 * fire-and-forget (rule 13 — failures don't propagate to the user).
 *
 * Returns 409 with `{ error, missing[] }` when a precondition is unmet
 * (mirrors rule 23 evidence-gated promotion).
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 7.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ClaimState, InspectionStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { withIdempotency } from "@/lib/idempotency";
import { canTransition } from "@/lib/lifecycle/inspection-state-machine";
import { loadTransitionContext } from "@/lib/lifecycle/load-context";
import { writeLifecycleTransition } from "@/lib/audit/lifecycle-event";
import { exportClosedJobToBYOKStorage } from "@/lib/queue/exportClosedJobToBYOKStorage";
import { onNextAction } from "@/lib/lifecycle/subscribers/next-action";
import { apiError, fromException } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CloseRequestBody {
  closeSummary?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  return withIdempotency(request, userId, async (rawBody) => {
    let body: CloseRequestBody;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return apiError(request, { code: "VALIDATION", message: "Invalid JSON body", status: 400 });
    }
    const closeSummary = body.closeSummary?.trim();
    if (!closeSummary) {
      return apiError(request, { code: "VALIDATION", message: "closeSummary required", status: 400 });
    }

    // Tenancy gate before the transaction. Admin bypass handled inside.
    // RA-6800 — resolve write scopes here (before $transaction opens) so the
    // CAS writes inside the tx re-assert ownership atomically.
    const tenancy = await resolveInspectionWrite(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const ctx = await loadTransitionContext(tx, inspectionId);
        const gate = canTransition(
          InspectionStatus.IN_BILLING,
          InspectionStatus.CLOSED,
          ctx,
        );
        if (!gate.ok) {
          return {
            code: 409 as const,
            error: "Preconditions not met",
            missing: gate.missing,
          };
        }

        // CAS — only flip from IN_BILLING. Concurrent calls or status drift
        // surface as a 409 with the synthetic missing key 'status_drift'.
        const completedAt = new Date();
        const cas = await tx.inspection.updateMany({
          where: {
            ...tenancy.data.inspectionManyWhere,
            status: InspectionStatus.IN_BILLING,
          },
          data: {
            status: InspectionStatus.CLOSED,
            completedAt,
            closeSummary,
          },
        });
        if (cas.count === 0) {
          return {
            code: 409 as const,
            error: "Inspection status drifted",
            missing: ["status_drift"],
          };
        }

        const transition = await writeLifecycleTransition({
          inspectionId,
          fromState: ClaimState.INVOICE_ISSUED,
          toState: ClaimState.CLOSED,
          transitionKey: "close_job",
          actorUserId: userId,
          actorRole: (session.user as { role?: string }).role ?? "USER",
          actorName: session.user.name ?? "User",
          guardSnapshot: {
            softGaps: gate.softGaps,
            preconditions: { invoice_paid: true, report_sent: true },
          } as Prisma.InputJsonValue,
          auditAction: "JOB_CLOSED",
          prismaTx: tx,
        });

        // Update ClaimProgress.currentState + closedAt to mirror the
        // inspection terminal state. This keeps the M-4 progress view
        // consistent with the inspection's lifecycle.
        await tx.claimProgress.updateMany({
          where: {
            inspectionId,
            ...(tenancy.data.childInspectionFilter && {
              inspection: tenancy.data.childInspectionFilter,
            }),
          },
          data: {
            previousState: ClaimState.INVOICE_ISSUED,
            currentState: ClaimState.CLOSED,
            closedAt: completedAt,
          },
        });

        return {
          code: 200 as const,
          transitionId: transition.id,
          completedAt,
        };
      });

      if (result.code !== 200) {
        return NextResponse.json(
          { error: result.error, missing: result.missing },
          { status: result.code },
        );
      }

      // P1 #11.1 — fire-and-forget next-action nudge ("ready to hand over").
      void onNextAction(inspectionId, InspectionStatus.CLOSED).catch((err) =>
        console.error("[next-action] CLOSED nudge failed:", err),
      );

      // Fire-and-forget SP-E export (rule 13). On success, persist the
      // storage key so the UI can surface the closed package later.
      exportClosedJobToBYOKStorage(inspectionId)
        .then(async ({ storageKey }) => {
          if (!storageKey) return;
          await prisma.inspection.update({
            where: tenancy.data.inspectionWhere,
            data: { closePackageStorageKey: storageKey },
          });
        })
        .catch((err) => {
          console.error(
            `[close] SP-E mirror failed for ${inspectionId}:`,
            err,
          );
        });

      return NextResponse.json({
        success: true,
        transitionId: result.transitionId,
        completedAt: result.completedAt,
      });
    } catch (err) {
      return fromException(request, err, { stage: "close" });
    }
  });
}
