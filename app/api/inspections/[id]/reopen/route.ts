/**
 * POST /api/inspections/[id]/reopen
 *
 * Admin-only un-archive route. Reverts a closed/archived inspection
 * back to IN_BILLING so finance, audit, or customer-dispute corrections
 * can be processed without a manual DB
 * write.
 *
 * Verified P0 #2 (punch-list 2026-05-15) — without this endpoint admins
 * had no in-product way to reverse a wrongly-closed inspection.
 *
 * Contract:
 *   - 401 when no session.
 *   - 403 when caller is not ADMIN (verified against DB per CLAUDE.md
 *     rule #3 — JWT role can be stale up to 30 days).
 *   - 422 when `reason` is missing or shorter than 10 characters.
 *   - 404 when the inspection does not exist.
 *   - 409 when the inspection is not in a terminal state.
 *   - 200 + `{ data: { previousStatus, newStatus } }` on success
 *     (RA-1548 envelope).
 *
 * Every successful reopen writes a ProgressTransition and an AuditLog row
 * with the action `INSPECTION_REOPENED`, the previous + new status, and
 * the free-text reason — forensic record for the compliance trail.
 *
 * Stripe invoice reversal is out of scope for this route; see TODO
 * below for the `voidInvoice` knob.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ClaimState, InspectionStatus, Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-errors";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/lifecycle/inspection-state-machine";
import { writeLifecycleTransition } from "@/lib/audit/lifecycle-event";

// Terminal states that can be reopened. DRAFT / SUBMITTED / PROCESSING /
// CLASSIFIED / SCOPED / ESTIMATED are intermediate, so reopening them
// makes no sense (they have nowhere to "go back to").
const TERMINAL_STATUSES = [
  InspectionStatus.CLOSED,
  InspectionStatus.ARCHIVED,
] as const;
type TerminalInspectionStatus = (typeof TERMINAL_STATUSES)[number];

// State we reopen TO so billing, dispute, and finance corrections can resume.
const REOPENED_STATUS = InspectionStatus.IN_BILLING;

const MIN_REASON_LENGTH = 10;

interface ReopenBody {
  reason?: unknown;
  voidInvoice?: unknown;
}

function isTerminalStatus(
  status: InspectionStatus,
): status is TerminalInspectionStatus {
  return TERMINAL_STATUSES.some((terminalStatus) => terminalStatus === status);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  // Admin gate — DB re-check, not JWT alone (CLAUDE.md rule #3).
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const adminUserId = auth.user!.id;

  const { id } = await params;

  let body: ReopenBody;
  try {
    body = (await request.json()) as ReopenBody;
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const reason =
    typeof body.reason === "string" ? body.reason.trim() : undefined;
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    return apiError(request, {
      code: "VALIDATION",
      message: `Field 'reason' is required and must be at least ${MIN_REASON_LENGTH} characters — this is logged for compliance.`,
      status: 422,
    });
  }

  // Read with explicit select (CLAUDE.md rule #4).
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!inspection) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }

  const currentStatus = inspection.status as InspectionStatus;
  if (!isTerminalStatus(currentStatus)) {
    return apiError(request, {
      code: "CONFLICT",
      message: `Cannot reopen inspection in status '${inspection.status}'. Only ${TERMINAL_STATUSES.join(" / ")} inspections may be reopened.`,
      status: 409,
    });
  }

  const gate = canTransition(currentStatus, REOPENED_STATUS, {
    invoiceStatus: null,
    reportStatus: null,
    handoverCompletedAt: null,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Invalid reopen transition", missing: gate.missing },
      { status: 409 },
    );
  }

  const previousStatus = currentStatus;

  const result = await prisma.$transaction(async (tx) => {
    const cas = await tx.inspection.updateMany({
      where: { id, status: previousStatus },
      data: { status: REOPENED_STATUS, completedAt: null },
    });
    if (cas.count === 0) {
      return {
        code: 409 as const,
        error: "Inspection status drifted",
        missing: ["status_drift"],
      };
    }

    const transition = await writeLifecycleTransition({
      inspectionId: id,
      fromState: ClaimState.CLOSED,
      toState: ClaimState.INVOICE_ISSUED,
      transitionKey: "reopen_job",
      actorUserId: adminUserId,
      actorRole: auth.user!.role ?? "ADMIN",
      actorName: session?.user?.name ?? "Admin",
      guardSnapshot: {
        reason,
        previousInspectionStatus: previousStatus,
        newInspectionStatus: REOPENED_STATUS,
      } as Prisma.InputJsonValue,
      auditAction: "INSPECTION_REOPENED",
      auditChanges: {
        reason,
        previousInspectionStatus: previousStatus,
        newInspectionStatus: REOPENED_STATUS,
      },
      prismaTx: tx,
    });

    await tx.claimProgress.updateMany({
      where: { inspectionId: id },
      data: {
        previousState: ClaimState.CLOSED,
        currentState: ClaimState.INVOICE_ISSUED,
        closedAt: null,
      },
    });

    return {
      code: 200 as const,
      transitionId: transition.id,
    };
  });

  if (result.code !== 200) {
    return NextResponse.json(
      { error: result.error, missing: result.missing },
      { status: result.code },
    );
  }

  // TODO(RA-XXXX): If body.voidInvoice === true, reverse the linked
  // Stripe invoice via lib/integrations/stripe. Out of scope for this
  // PR — once the invoice-reversal helper lands as a 5-line drop-in,
  // wire it here and add a `invoiceVoided: boolean` to the response.
  if (body.voidInvoice === true) {
    // Not implemented yet — surface so callers know nothing happened.
    return NextResponse.json({
      data: {
        previousStatus,
        newStatus: REOPENED_STATUS,
        transitionId: result.transitionId,
        invoiceVoided: false,
        warning:
          "voidInvoice=true was passed but Stripe reversal is not yet implemented (tracked separately).",
      },
    });
  }

  return NextResponse.json({
    data: {
      previousStatus,
      newStatus: REOPENED_STATUS,
      transitionId: result.transitionId,
    },
  });
}
