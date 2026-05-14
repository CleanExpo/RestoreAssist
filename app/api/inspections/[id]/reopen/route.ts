/**
 * POST /api/inspections/[id]/reopen
 *
 * Admin-only un-archive route. Reverts a terminally-closed inspection
 * (status = COMPLETED or REJECTED) back to ESTIMATED so finance, audit,
 * or customer-dispute corrections can be processed without a manual DB
 * write.
 *
 * Verified P0 #2 (punch-list 2026-05-15) — without this endpoint admins
 * had no in-product way to reverse a wrongly-closed inspection.
 *
 * Contract:
 *   - 401 when no session.
 *   - 403 when caller is not ADMIN (verified against DB per CLAUDE.md
 *     rule #3 — JWT role can be stale up to 30 days).
 *   - 400 when `reason` is missing or shorter than 10 characters.
 *   - 404 when the inspection does not exist.
 *   - 409 when the inspection is not in a terminal state.
 *   - 200 + `{ data: { previousStatus, newStatus } }` on success
 *     (RA-1548 envelope).
 *
 * Every successful reopen writes an AuditLog row with the action
 * `JOB_REOPENED`, the previous + new status, and the free-text reason
 * — forensic record for the compliance trail.
 *
 * Stripe invoice reversal is out of scope for this route; see TODO
 * below for the `voidInvoice` knob.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

// Terminal states that can be reopened. Mirrors the InspectionStatus
// enum in prisma/schema.prisma — COMPLETED is the success terminus, and
// REJECTED is the rejection terminus. DRAFT / SUBMITTED / PROCESSING /
// CLASSIFIED / SCOPED / ESTIMATED are intermediate, so reopening them
// makes no sense (they have nowhere to "go back to").
const TERMINAL_STATUSES = ["COMPLETED", "REJECTED"] as const;

// State we reopen TO. Per the prompt + spec section 12.2: ESTIMATED is
// the latest pre-COMPLETED stage, so the admin lands the inspection back
// in the place where they can edit costs / regenerate scope / re-submit.
const REOPENED_STATUS = "ESTIMATED" as const;

const MIN_REASON_LENGTH = 10;

interface ReopenBody {
  reason?: unknown;
  voidInvoice?: unknown;
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
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" ? body.reason.trim() : undefined;
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `Field 'reason' is required and must be at least ${MIN_REASON_LENGTH} characters — this is logged for compliance.`,
      },
      { status: 400 },
    );
  }

  // Read with explicit select (CLAUDE.md rule #4).
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  if (!TERMINAL_STATUSES.includes(inspection.status as (typeof TERMINAL_STATUSES)[number])) {
    return NextResponse.json(
      {
        error: `Cannot reopen inspection in status '${inspection.status}'. Only ${TERMINAL_STATUSES.join(" / ")} inspections may be reopened.`,
      },
      { status: 409 },
    );
  }

  const previousStatus = inspection.status;

  // Flip the status. We don't null out a `completedAt` field because
  // Inspection has no such column (other models do; the inspection itself
  // tracks lifecycle exclusively through `status` and `submittedAt` /
  // `processedAt`).
  await prisma.inspection.update({
    where: { id },
    data: { status: REOPENED_STATUS },
  });

  // Append-only audit row. The AuditLog model is inspection-scoped, so
  // the reason / prev-status / new-status are stamped into the structured
  // fields and the action is the canonical `JOB_REOPENED` token used by
  // SP-A audit tooling (see docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §12).
  await prisma.auditLog.create({
    data: {
      inspectionId: id,
      action: "JOB_REOPENED",
      entityType: "Inspection",
      entityId: id,
      userId: adminUserId,
      previousValue: previousStatus,
      newValue: REOPENED_STATUS,
      changes: JSON.stringify({ reason }),
    },
  });

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
    },
  });
}
