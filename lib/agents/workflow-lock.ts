/**
 * RA-8000: the one place that serialises writers of a workflow's status.
 *
 * "PAUSED exactly while a task is AWAITING_APPROVAL" is decided by reading the
 * task rows and then writing the workflow row. Under READ COMMITTED two
 * transactions can each read a state the other has not committed. Every
 * transaction that reads task state to decide a workflow status, or writes a
 * workflow's status after touching its tasks, takes this lock first, so the
 * read that follows sees the other writer's committed work.
 *
 * Take it as the first statement of the transaction. Taking it after a task
 * write would invert the order used by the other holders and can deadlock.
 */

import type { Prisma } from "@prisma/client";

export async function lockWorkflowRow(
  tx: Prisma.TransactionClient,
  workflowId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "AgentWorkflow" WHERE id = ${workflowId} FOR UPDATE`;
}

/**
 * Lock and return the ids of a user's workflows that have not finished, in one
 * statement: the status test is re-evaluated on each row after its lock is
 * granted, so a workflow another writer just finished is not returned.
 */
export async function lockOpenWorkflowsOfUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "AgentWorkflow"
    WHERE "userId" = ${userId}
      AND status NOT IN ('COMPLETED', 'FAILED', 'PARTIALLY_FAILED', 'CANCELLED')
    ORDER BY id
    FOR UPDATE`;
  return rows.map((row) => row.id);
}

/**
 * Lock several workflows in one fixed order (by id), so two callers that lock
 * overlapping sets cannot wait on each other.
 */
export async function lockWorkflowRows(
  tx: Prisma.TransactionClient,
  workflowIds: Iterable<string>,
): Promise<void> {
  for (const id of [...new Set(workflowIds)].sort()) {
    await lockWorkflowRow(tx, id);
  }
}
