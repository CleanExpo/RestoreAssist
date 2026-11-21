/**
 * The one definition of an active job. Kept free of Prisma imports because the
 * dashboard's client bundle uses it too.
 *
 * IN_BILLING stays active: the invoice is out but the job is not yet closed.
 */
export const INACTIVE_INSPECTION_STATUSES = [
  "COMPLETED",
  "REJECTED",
  "CLOSED",
  "ARCHIVED",
] as const;

/** A job that reached its end. REJECTED never did; IN_BILLING has not yet. */
export const FINISHED_INSPECTION_STATUSES = ["COMPLETED", "CLOSED"] as const;

/** Finished, including a finished job since archived (it kept its finish date). */
export function finishedJobWhere() {
  return {
    OR: [
      { status: { in: [...FINISHED_INSPECTION_STATUSES] } },
      { status: "ARCHIVED" as const, completedAt: { not: null } },
    ],
  };
}

/**
 * Finished inside a period, dated on `completedAt` so a later edit cannot move
 * the job. Legacy rows have no `completedAt`, so `updatedAt` is the only date
 * they offer.
 */
export function finishedInPeriodWhere(range: { gte: Date; lt?: Date }) {
  return {
    OR: [
      {
        completedAt: range,
        status: { in: [...FINISHED_INSPECTION_STATUSES, "ARCHIVED" as const] },
      },
      {
        completedAt: null,
        status: { in: [...FINISHED_INSPECTION_STATUSES] },
        updatedAt: range,
      },
    ],
  };
}

/**
 * States in which a Dispute Defence Pack may be generated (RA-8421). A dispute
 * can only be raised after the invoice is issued (INVOICE_ISSUED -> DISPUTED in
 * lib/progress/state-machine.ts), and issuing it moves the job to IN_BILLING,
 * so IN_BILLING and CLOSED are the states that matter. SUBMITTED and legacy
 * COMPLETED rows keep working. ARCHIVED is included: it is reached only from
 * CLOSED (lib/lifecycle/inspection-state-machine.ts), and an insurer dispute can
 * arrive after a job is archived; generating the pack does not change the job.
 */
export const DISPUTE_PACK_INSPECTION_STATUSES = [
  "SUBMITTED",
  "COMPLETED",
  "IN_BILLING",
  "CLOSED",
  "ARCHIVED",
] as const;

/**
 * States in which the NIR report may be generated: review-ready (ESTIMATED,
 * SUBMITTED) and every later state, for the same reason as the dispute pack.
 */
export const NIR_REPORT_INSPECTION_STATUSES = [
  "ESTIMATED",
  ...DISPUTE_PACK_INSPECTION_STATUSES,
] as const;

export function inspectionStatusAllowsDisputePack(
  status: string | null | undefined,
): boolean {
  return (DISPUTE_PACK_INSPECTION_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function inspectionStatusAllowsNirReport(
  status: string | null | undefined,
): boolean {
  return (NIR_REPORT_INSPECTION_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function isActiveInspectionStatus(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  return (
    s !== "CANCELLED" &&
    !(INACTIVE_INSPECTION_STATUSES as readonly string[]).includes(s)
  );
}

/**
 * Every active state, in lifecycle order: exactly the states for which
 * isActiveInspectionStatus is true. For callers that must name the states, such
 * as the field view's `?status=` query (RA-8422). A unit test ties this list to
 * isActiveInspectionStatus over the whole enum, so the two cannot drift.
 */
export const ACTIVE_INSPECTION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "IN_BILLING",
] as const;

/**
 * States in which a job may be signed off (RA-8422; was hand-typed in the sign
 * route and the job page's canSignOff). The sign route also requires
 * `signedAt: null`, so a signed job cannot be signed again.
 */
export const SIGN_OFF_INSPECTION_STATUSES = [
  "ESTIMATED",
  "COMPLETED",
  "SUBMITTED",
] as const;

export function inspectionStatusAllowsSignOff(
  status: string | null | undefined,
): boolean {
  return (SIGN_OFF_INSPECTION_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

/**
 * SUBMITTED and every later state, REJECTED excepted: the live teacher treats a
 * job in any of these as past the submission step (RA-8422).
 */
export const SUBMITTED_OR_LATER_INSPECTION_STATUSES = [
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "IN_BILLING",
  "COMPLETED",
  "CLOSED",
  "ARCHIVED",
] as const;

/**
 * States from which a Guidewire payload may be generated, kept exactly as the
 * route had them (RA-8422), in the order the 422 response reports them.
 *
 * OPEN QUESTION (owner decision): IN_BILLING and CLOSED are not here, so an
 * invoiced or closed job cannot be sent to Guidewire. This is the same gap
 * RA-8421 fixed for the dispute pack and NIR report. SUBMITTED is also absent.
 * Do not add them without the owner's decision.
 */
export const GUIDEWIRE_EXPORT_INSPECTION_STATUSES = [
  "ESTIMATED",
  "COMPLETED",
  "SCOPED",
  "CLASSIFIED",
] as const;

export function inspectionStatusAllowsGuidewireExport(
  status: string | null | undefined,
): boolean {
  return (GUIDEWIRE_EXPORT_INSPECTION_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

/**
 * States the daily pulse digest counts as active, kept exactly as the cron had
 * them (RA-8422).
 *
 * OPEN QUESTION (owner decision): IN_BILLING is excluded here, while
 * isActiveInspectionStatus counts it as active. Do not switch the digest to
 * ACTIVE_INSPECTION_STATUSES without the owner's decision.
 */
export const PULSE_DIGEST_INSPECTION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
] as const;
