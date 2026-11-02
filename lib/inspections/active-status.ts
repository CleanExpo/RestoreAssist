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

export function isActiveInspectionStatus(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  return (
    s !== "CANCELLED" &&
    !(INACTIVE_INSPECTION_STATUSES as readonly string[]).includes(s)
  );
}
