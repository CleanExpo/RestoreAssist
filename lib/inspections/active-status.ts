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
