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

function isEstimateStatus(v: unknown): v is EstimateStatus {
  return typeof v === "string" && (ALLOWED_STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;

    if (!body || !isEstimateStatus(body.status)) {
      return NextResponse.json(
        {
          error: `status must be one of ${ALLOWED_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Load the estimate with the projections the check needs
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        subtotalExGST: true,
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
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    if (estimate.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        return NextResponse.json(
          {
            error: "Billing incomplete",
            blockers: result.blockers,
            warnings: result.warnings,
          },
          { status: 422 },
        );
      }

      const updated = await prisma.estimate.update({
        where: { id },
        data: { status: body.status, updatedBy: session.user.id },
      });

      await recordMutationAudit({
        resource: "estimate",
        resourceId: id,
        verb: "UPDATE",
        action: "estimate.status.transition",
        actorUserId: session.user.id,
        metadata: {
          from: estimate.status,
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
    const updated = await prisma.estimate.update({
      where: { id },
      data: { status: body.status, updatedBy: session.user.id },
    });

    await recordMutationAudit({
      resource: "estimate",
      resourceId: id,
      verb: "UPDATE",
      action: "estimate.status.transition",
      actorUserId: session.user.id,
      metadata: { from: estimate.status, to: body.status },
      request,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[estimates status PATCH]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
