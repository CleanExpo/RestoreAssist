/**
 * RA-8000: the one place that serialises writers of a workflow's status.
 *
 * "PAUSED exactly while a task is AWAITING_APPROVAL" is decided by reading the
 * task rows and then writing the workflow row. Under READ COMMITTED two
 * transactions can each read a state the other has not committed. Every
 * transaction that reads task state to decide a workflow status takes this
 * lock first, so the read that follows sees the other writer's committed work.
 */

import type { Prisma } from "@prisma/client";

export async function lockWorkflowRow(
  tx: Prisma.TransactionClient,
  workflowId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "AgentWorkflow" WHERE id = ${workflowId} FOR UPDATE`;
}
