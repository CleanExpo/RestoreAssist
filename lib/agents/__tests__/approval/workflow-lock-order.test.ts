/**
 * RA-8000 — every transaction that reads a workflow's task rows to decide its
 * status takes the workflow row lock BEFORE that read.
 *
 * Each case replays the race: another writer holds the workflow row lock with
 * an uncommitted change to the task rows (the shape of markTasksReady), the
 * path under test starts, then the other writer commits. A path that read the
 * tasks before waiting for the lock decides from the old rows and writes the
 * wrong status. A path that locks first reads the committed rows.
 *
 * Real Postgres; runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { executeTask, claimTask, resumeWorkflow, sweepExpiredLeases } from "@/lib/agents";
import { moveToDeadLetter } from "@/lib/agents/error-handler";
import {
  cleanup,
  context,
  deferred,
  expireLease,
  makeWorkflow,
  registerTestAgent,
  task,
  workflow,
} from "../durable/fixtures";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Hold the workflow row lock with `mutate` applied and uncommitted, start the
 * operation, let it reach the lock wait, then commit. Resolves to the
 * operation's outcome so a thrown error can be asserted.
 */
async function raceAgainstLockHolder(
  workflowId: string,
  mutate: (tx: Prisma.TransactionClient) => Promise<void>,
  startOperation: () => Promise<unknown>,
): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }> {
  const held = deferred<void>();
  const release = deferred<void>();
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AgentWorkflow" WHERE id = ${workflowId} FOR UPDATE`;
      await mutate(tx);
      held.resolve();
      await release.promise;
    },
    { timeout: 20_000 },
  );
  await held.promise;
  const operation = startOperation().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await sleep(600);
  release.resolve();
  await holder;
  return operation;
}

describe.skipIf(!process.env.DATABASE_URL)("RA-8000 workflow lock is taken before the task read", () => {
  let slugA = "";
  const failGate = { current: deferred<void>(), entered: deferred<void>() };
  let slugFail = "";

  beforeAll(async () => {
    slugA = await registerTestAgent("lock-a", async () => {
      throw new Error("not run");
    });
    slugFail = await registerTestAgent("lock-fail", async () => {
      failGate.entered.resolve();
      await failGate.current.promise;
      throw new Error("validation failed: bad input");
    });
  });
  afterAll(async () => {
    await cleanup();
  });

  /** A sibling task that another writer completes while the path under test waits. */
  const completeSibling = (siblingId: string) => async (tx: Prisma.TransactionClient) => {
    await tx.agentTask.update({ where: { id: siblingId }, data: { status: "COMPLETED" } });
  };

  it("resume sees an approval pause committed while it waited, and refuses (mutant: read the waiting task before the lock)", async () => {
    const wf = await makeWorkflow(
      [
        { key: "a", agentSlug: slugA, status: "COMPLETED" },
        { key: "gated", agentSlug: slugA, status: "PENDING", dependsOn: ["a"], requiresApproval: true },
      ],
      { status: "PAUSED" },
    );
    const outcome = await raceAgainstLockHolder(
      wf.workflowId,
      async (tx) => {
        await tx.agentTask.update({
          where: { id: wf.ids.gated },
          data: { status: "AWAITING_APPROVAL", approvalRequestedAt: new Date() },
        });
        await tx.agentWorkflow.update({ where: { id: wf.workflowId }, data: { status: "PAUSED" } });
      },
      () => resumeWorkflow(wf.workflowId),
    );
    expect(outcome).toMatchObject({ ok: false, error: { name: "ApprovalPendingError" } });
    expect((await workflow(wf.workflowId)).status).toBe("PAUSED");
    expect((await task(wf.ids.gated)).status).toBe("AWAITING_APPROVAL");
  });

  it("a failing task's progress refresh counts a sibling committed while it waited (mutant: refresh before the lock)", async () => {
    failGate.current = deferred<void>();
    failGate.entered = deferred<void>();
    const wf = await makeWorkflow(
      [
        { key: "x", agentSlug: slugFail, status: "READY", maxRetries: 1 },
        { key: "y", agentSlug: slugA, status: "READY" },
      ],
      { status: "RUNNING" },
    );
    const running = executeTask(await task(wf.ids.x), context(wf.workflowId));
    await failGate.entered.promise;
    const outcome = await raceAgainstLockHolder(
      wf.workflowId,
      completeSibling(wf.ids.y),
      async () => {
        failGate.current.resolve();
        return running;
      },
    );
    expect(outcome).toMatchObject({ ok: true });
    expect((await task(wf.ids.x)).status).toMatch(/FAILED|DEAD_LETTER/);
    expect((await workflow(wf.workflowId)).status).toBe("PARTIALLY_FAILED");
  });

  it("moveToDeadLetter's progress refresh counts a sibling committed while it waited (mutant: refresh before the lock)", async () => {
    const wf = await makeWorkflow(
      [
        { key: "x", agentSlug: slugA, status: "READY" },
        { key: "y", agentSlug: slugA, status: "READY" },
      ],
      { status: "RUNNING" },
    );
    const claim = await claimTask(wf.ids.x, 15_000);
    expect(claim).not.toBeNull();
    const outcome = await raceAgainstLockHolder(
      wf.workflowId,
      completeSibling(wf.ids.y),
      () => moveToDeadLetter(wf.ids.x, claim!.leaseOwner, new Error("validation failed")),
    );
    expect(outcome).toMatchObject({ ok: true, value: true });
    expect((await workflow(wf.workflowId)).status).toBe("PARTIALLY_FAILED");
  });

  it("the lease sweep's progress refresh counts a sibling committed while it waited (mutant: sweep without the workflow lock)", async () => {
    const wf = await makeWorkflow(
      [
        { key: "x", agentSlug: slugA, status: "READY", maxRetries: 1 },
        { key: "y", agentSlug: slugA, status: "READY" },
      ],
      { status: "RUNNING" },
    );
    expect(await claimTask(wf.ids.x, 15_000)).not.toBeNull();
    await expireLease(wf.ids.x);
    const outcome = await raceAgainstLockHolder(
      wf.workflowId,
      completeSibling(wf.ids.y),
      () => sweepExpiredLeases({ workflowId: wf.workflowId }),
    );
    expect(outcome).toMatchObject({ ok: true });
    expect((await task(wf.ids.x)).status).toBe("DEAD_LETTER");
    expect((await workflow(wf.workflowId)).status).toBe("PARTIALLY_FAILED");
  });
});
