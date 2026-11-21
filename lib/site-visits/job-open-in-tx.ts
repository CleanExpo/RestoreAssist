/**
 * RA-8498 — the one place a visit writer confirms, inside its locked
 * transaction, that the job still takes visits.
 *
 * Each visit route reads the job's status first to refuse early, but that read
 * is outside the transaction: a job closed between that read and the write
 * would otherwise take a new or changed visit. writeWithinInspectionScope's
 * parent update holds the job's row lock, so a status read made here, after
 * that update, sees any close that committed first and blocks any that has
 * not. Every visit writer calls this as the first step of its `work`.
 */
import type { Prisma } from "@prisma/client";
import { isVisitLockedStatus } from "./visit-gate";

/** The answer a visit writer returns when the job is no longer active. */
export const JOB_CLOSED_MESSAGE = "This job is closed. Reopen it before recording or changing a site visit.";

export async function jobTakesVisitsInTx(tx: Prisma.TransactionClient, inspectionId: string): Promise<boolean> {
  const job = await tx.inspection.findUnique({ where: { id: inspectionId }, select: { status: true } });
  return job !== null && !isVisitLockedStatus(job.status);
}
