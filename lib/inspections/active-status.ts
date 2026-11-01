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

export function isActiveInspectionStatus(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  return (
    s !== "CANCELLED" &&
    !(INACTIVE_INSPECTION_STATUSES as readonly string[]).includes(s)
  );
}
