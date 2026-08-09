/**
 * RA-876: Estimate status transition — PATCH /api/estimates/[id]/status
 *
 * Transitions an Estimate between workflow states. On transition to
 * INTERNAL_REVIEW, runs the billing-completeness-check — returns 422 with
 * blockers if any are present, 200 with warnings otherwise.
 *
 * Body:
 *   { status: "INTERNAL_REVIEW" | "SENT" | "CLIENT_REVIEW" | "APPROVED" | "LOCKED" | "DRAFT" | "REJECTED" | "EXPIRED" | "WITHDRAWN" }
 *
 * RA-1365 (2026-04-21) — enum expanded. SENT separates "emailed" from
 * "under active client review"; REJECTED/EXPIRED/WITHDRAWN are terminal
 * outcomes for declined / timed-out / retracted quotes (previously
 * stranded in CLIENT_REVIEW or force-LOCKED).
 *
 * Auth: getServerSession required. Estimate ownership enforced.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkBillingCompleteness,
  type EstimateForCheck,
} from "@/lib/billing-completeness-check";
import { recordMutationAudit } from "@/lib/audit-log";
import { apiError, fromException } from "@/lib/api-errors";

const ALLOWED_STATUSES = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT",
  "CLIENT_REVIEW",
  "APPROVED",
  "LOCKED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const;

type EstimateStatus = (typeof ALLOWED_STATUSES)[number];

const LEGAL_TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  DRAFT: ["INTERNAL_REVIEW", "WITHDRAWN"],
  INTERNAL_REVIEW: ["DRAFT", "SENT", "WITHDRAWN"],
  SENT: ["CLIENT_REVIEW", "EXPIRED", "WITHDRAWN"],
  CLIENT_REVIEW: ["APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

function isEstimateStatus(v: unknown): v is EstimateStatus {
  return (
    typeof v === "string" && (ALLOWED_STATUSES as readonly string[]).includes(v)
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;

    if (!body || !isEstimateStatus(body.status)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `status must be one of ${ALLOWED_STATUSES.join(", ")}`,
        status: 400,
      });
    }

    // Load the estimate with the projections the check needs
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reportId: true,
        report: {
          select: {
            reportVersion: true,
            updatedAt: true,
          },
        },
        status: true,
        subtotalExGST: true,
        totalIncGST: true,
        estimatedDuration: true,
        metadata: true,
        scope: {
          select: {
            scopeType: true,
            siteVariables: true,
            complianceNotes: true,
          },
        },
        lineItems: {
          select: {
            category: true,
            description: true,
            qty: true,
            subtotal: true,
          },
          take: 500,
        },
      },
    });

    if (!estimate) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Estimate not found",
        status: 404,
      });
    }

    if (estimate.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    const currentStatus = estimate.status as EstimateStatus;
    if (!LEGAL_TRANSITIONS[currentStatus]?.includes(body.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: `Cannot transition estimate from ${currentStatus} to ${body.status}`,
        status: 409,
      });
    }

    let approvalEvidence: {
      id: string;
      respondedAt: Date | null;
      amount: number | null;
      respondedByClientUserId: string | null;
    } | null = null;
    if (body.status === "APPROVED") {
      approvalEvidence = await prisma.reportApproval.findFirst({
        where: {
          reportId: estimate.reportId,
          approvalType: "COST_ESTIMATE",
          status: "APPROVED",
          respondedAt: { not: null },
          responseSource: "CLIENT_PORTAL",
          respondedByClientUserId: { not: null },
          responseReportVersion: estimate.report.reportVersion,
          responseReportUpdatedAt: estimate.report.updatedAt,
        },
        select: {
          id: true,
          respondedAt: true,
          amount: true,
          respondedByClientUserId: true,
        },
      });

      if (
        !approvalEvidence?.respondedAt ||
        !approvalEvidence.respondedByClientUserId
      ) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Current client portal cost approval is required before the estimate can be approved",
          status: 409,
        });
      }

      if (
        approvalEvidence.amount === null ||
        estimate.totalIncGST === null ||
        Math.abs(approvalEvidence.amount - estimate.totalIncGST) > 0.01
      ) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Client approval amount does not match the current estimate total",
          status: 409,
        });
      }
    }

    // Run the completeness check only when transitioning to INTERNAL_REVIEW.
    // Other transitions (e.g. CLIENT_REVIEW → APPROVED) are not gated here.
    if (body.status === "INTERNAL_REVIEW") {
      // Parse affected area + scope item count from scope.siteVariables / scope lines
      // (siteVariables is a JSON blob with { affectedAreaM2, ... })
      let affectedAreaM2: number | null = null;
      let s760ChecklistCompleted: boolean | null = null;
      try {
        if (estimate.scope?.siteVariables) {
          const sv = JSON.parse(estimate.scope.siteVariables);
          if (typeof sv?.affectedAreaM2 === "number") {
            affectedAreaM2 = sv.affectedAreaM2;
          }
          if (typeof sv?.s760ChecklistCompleted === "boolean") {
            s760ChecklistCompleted = sv.s760ChecklistCompleted;
          }
        }
      } catch {
        /* malformed siteVariables — fall through */
      }

      const input: EstimateForCheck = {
        subtotalExGST: estimate.subtotalExGST,
        estimatedDuration: estimate.estimatedDuration,
        metadata: estimate.metadata,
        lineItems: estimate.lineItems,
        scope: estimate.scope
          ? {
              scopeType: estimate.scope.scopeType,
              scopeItemCount: estimate.lineItems.length > 0 ? null : 1,
              affectedAreaM2,
              s760ChecklistCompleted,
            }
          : null,
      };

      const result = checkBillingCompleteness(input);

      if (!result.complete) {
        // Domain-specific 422 — keeps the existing shape so the UI can
        // iterate `blockers` and `warnings`. Matches apiError envelope
        // only on the top-level `error` field.
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION",
              message: "Billing incomplete",
            },
            blockers: result.blockers,
            warnings: result.warnings,
          },
          { status: 422 },
        );
      }

      const transitioned = await prisma.estimate.updateMany({
        where: { id, userId: session.user.id, status: currentStatus },
        data: { status: body.status, updatedBy: session.user.id },
      });

      if (transitioned.count === 0) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Estimate status changed before this transition completed",
          status: 409,
        });
      }

      const updated = await prisma.estimate.findUnique({ where: { id } });

      await recordMutationAudit({
        resource: "estimate",
        resourceId: id,
        verb: "UPDATE",
        action: "estimate.status.transition",
        actorUserId: session.user.id,
        metadata: {
          from: currentStatus,
          to: body.status,
          warnings: result.warnings,
        },
        request,
      });

      return NextResponse.json({
        data: updated,
        warnings: result.warnings,
      });
    }

    // Non-gated transitions — update and return
    const transitioned = await prisma.estimate.updateMany({
      where: { id, userId: session.user.id, status: currentStatus },
      data: {
        status: body.status,
        updatedBy: session.user.id,
        ...(approvalEvidence
          ? {
              approvedAt: approvalEvidence.respondedAt,
              approverName: "Client portal approval",
              approverRole: "CLIENT",
            }
          : {}),
      },
    });

    if (transitioned.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Estimate status changed before this transition completed",
        status: 409,
      });
    }

    const updated = await prisma.estimate.findUnique({ where: { id } });

    await recordMutationAudit({
      resource: "estimate",
      resourceId: id,
      verb: "UPDATE",
      action: "estimate.status.transition",
      actorUserId: session.user.id,
      metadata: {
        from: currentStatus,
        to: body.status,
        ...(approvalEvidence ? { clientApprovalId: approvalEvidence.id } : {}),
      },
      request,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    return fromException(request, err, { stage: "estimate-status-patch" });
  }
}
