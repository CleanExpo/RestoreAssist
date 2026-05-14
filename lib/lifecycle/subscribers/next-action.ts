/**
 * Punch-list P1 #11.1 — next-action subscriber (1 of 5 lifecycle hooks).
 *
 * Observes an `Inspection.status` transition and writes a `Notification`
 * row to the tradie telling them the next CTA. Rule-driven only — a frozen
 * `STATUS → CTA` map. No AI, no external API calls.
 *
 * Pattern mirrors `lib/lifecycle/subscribers/invoice-paid.ts`:
 *   - Single exported function with a discriminated-union result.
 *   - Idempotency anchored on an `AuditLog` row keyed by
 *     `(action = NEXT_ACTION_SUGGESTED, entityType = "Inspection",
 *       entityId = inspectionId, changes = JSON.stringify({status}))`.
 *   - Fire-and-forget per CLAUDE.md rule #13 — caller wraps in
 *     `void onNextAction(...).catch(...)`. Never throws on expected
 *     branches (missing inspection, no-op status, already-observed).
 *
 * Notification target: the inspection's owner (`inspection.userId`). If
 * `inspection.technicianId` is set and differs from `userId`, both are
 * notified. (The schema has `technicianId`, not `assignedTechnicianId`;
 * see `prisma/schema.prisma` model Inspection.)
 *
 * State → action map (LOCKED — do not change without re-deliberation):
 *   DRAFT       → no-op (form-fill phase)
 *   SUBMITTED   → "AI is processing your inspection"
 *   PROCESSING  → no-op (too noisy)
 *   CLASSIFIED  → "Classification ready — review and adjust"
 *   SCOPED      → "Scope generated — review line items" (link → /scope)
 *   ESTIMATED   → "Estimate ready — review then close"
 *   COMPLETED   → no-op (legacy terminal — user just acted)
 *   REJECTED    → "Inspection rejected — review feedback"
 *   IN_BILLING  → "Invoice issued — awaiting payment"
 *   CLOSED      → "Job closed — ready to hand over" (link → /handover)
 *   ARCHIVED    → no-op (admin-driven, not user-facing)
 */

import { InspectionStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NextActionResult =
  | { kind: "notified"; notifiedUserIds: string[] }
  | { kind: "no-op"; reason: InspectionStatus }
  | {
      kind: "skipped";
      reason: "already_observed" | "inspection-not-found" | "internal_error";
    };

interface NextActionSpec {
  title: string;
  message: string;
  /** Suffix appended to `/dashboard/inspections/<id>`. Empty string ⇒ detail page. */
  linkSuffix: string;
  type: NotificationType;
}

/** The locked rule map. Keys present here trigger a notification; absent keys are no-ops. */
const ACTION_MAP: Partial<Record<InspectionStatus, NextActionSpec>> = {
  SUBMITTED: {
    title: "AI is processing your inspection",
    message:
      "We're classifying the loss and building the scope. You'll get another nudge when it's ready to review.",
    linkSuffix: "",
    type: "INFO",
  },
  CLASSIFIED: {
    title: "Classification ready",
    message: "AI classified your claim — review and adjust if needed.",
    linkSuffix: "",
    type: "INFO",
  },
  SCOPED: {
    title: "Scope generated",
    message: "Scope generated — review the line items before estimating costs.",
    linkSuffix: "/scope",
    type: "INFO",
  },
  ESTIMATED: {
    title: "Estimate ready",
    message: "Estimate ready — review then close this job.",
    linkSuffix: "",
    type: "SUCCESS",
  },
  REJECTED: {
    title: "Inspection rejected",
    message: "Inspection rejected — review the feedback and resubmit.",
    linkSuffix: "",
    type: "WARNING",
  },
  IN_BILLING: {
    title: "Invoice issued",
    message: "Invoice issued — the job will close once payment lands.",
    linkSuffix: "",
    type: "INFO",
  },
  CLOSED: {
    title: "Job closed",
    message: "Job closed — ready to hand over to the client.",
    linkSuffix: "/handover",
    type: "SUCCESS",
  },
};

export async function onNextAction(
  inspectionId: string,
  newStatus: InspectionStatus,
): Promise<NextActionResult> {
  const spec = ACTION_MAP[newStatus];
  if (!spec) {
    return { kind: "no-op", reason: newStatus };
  }

  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, userId: true, technicianId: true },
    });

    if (!inspection) {
      console.warn("[next-action] inspection not found", { inspectionId });
      return { kind: "skipped", reason: "inspection-not-found" };
    }

    const changes = JSON.stringify({ status: newStatus });

    // Idempotency — bail if we've already observed this (inspection, status).
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: "NEXT_ACTION_SUGGESTED",
        entityType: "Inspection",
        entityId: inspectionId,
        changes,
      },
      select: { id: true },
    });

    if (existing) {
      return { kind: "skipped", reason: "already_observed" };
    }

    const recipients: string[] = [inspection.userId];
    if (inspection.technicianId && inspection.technicianId !== inspection.userId) {
      recipients.push(inspection.technicianId);
    }

    const link = `/dashboard/inspections/${inspection.id}${spec.linkSuffix}`;

    for (const userId of recipients) {
      await prisma.notification.create({
        data: {
          userId,
          title: spec.title,
          message: spec.message,
          type: spec.type,
          link,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        inspectionId: inspection.id,
        action: "NEXT_ACTION_SUGGESTED",
        entityType: "Inspection",
        entityId: inspection.id,
        userId: inspection.userId,
        changes,
      },
    });

    return { kind: "notified", notifiedUserIds: recipients };
  } catch (err) {
    console.error("[next-action] subscriber failed", {
      inspectionId,
      newStatus,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: "skipped", reason: "internal_error" };
  }
}
