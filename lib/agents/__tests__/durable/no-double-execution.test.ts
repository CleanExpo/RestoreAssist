/**
 * RA-7999 slice 1a — [AC2] no double execution, against real Postgres.
 *
 * Two workers race on one READY task: the handler runs once. Then, for each
 * late-write path (completion, retry, terminal failure), worker A's lease is
 * reclaimed while its handler is still running, worker B claims the task in
 * the same process, and A's late write must match 0 rows: A reports
 * LEASE_LOST and B's leaseOwner, status, attempts and output survive.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { claimTask, executeTask, sweepExpiredLeases } from "@/lib/agents";
import type { TaskOutput } from "@/lib/agents";
import {
  cleanup,
  context,
  deferred,
  expireLease,
  logs,
  makeWorkflow,
  output,
  registerTestAgent,
  task,
  workflow,
  type Deferred,
} from "./fixtures";

/** Each handler call takes the next scripted deferred; `started` resolves on entry. */
let script: Array<{ started: Deferred<void>; result: Deferred<TaskOutput> }> = [];
let calls = 0;
let slug = "";

function nextCall() {
  const entry = { started: deferred<void>(), result: deferred<TaskOutput>() };
  script.push(entry);
  return entry;
}

describe.skipIf(!process.env.DATABASE_URL)("RA-7999 [AC2] no double execution", () => {
  beforeAll(async () => {
    slug = await registerTestAgent("race", async () => {
      const entry = script[calls++];
      if (!entry) return output("unscripted");
      entry.started.resolve();
      return entry.result.promise;
    });
  });
  beforeEach(() => {
    script = [];
    calls = 0;
  });
  afterAll(async () => {
    await cleanup();
  });

  it("[AC2] two workers racing on one READY task run the handler once", async () => {
    const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    const snapshot = await task(ids.a);
    const call = nextCall();
    call.result.resolve(output("only"));
    nextCall().result.resolve(output("second"));

    const results = await Promise.all([
      executeTask(snapshot, context(workflowId)),
      executeTask(snapshot, context(workflowId)),
    ]);

    expect(calls).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(["COMPLETED", "FAILED"]);
    const a = await task(ids.a);
    expect(a.status).toBe("COMPLETED");
    expect(a.attempts).toBe(1);
  });

  it("[AC2] the database rejects a non-RUNNING row that keeps a lease (CHECK), so a token match implies RUNNING", async () => {
    const { ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    const claim = await claimTask(ids.a, 15_000);
    expect(claim).not.toBeNull();

    const attempt = prisma.$executeRaw`
      UPDATE "AgentTask" SET status = 'COMPLETED' WHERE id = ${ids.a}`;
    await expect(attempt).rejects.toThrow(/AgentTask_lease_only_while_running|23514|check constraint/i);
    const a = await task(ids.a);
    expect(a.status).toBe("RUNNING");
    expect(a.leaseOwner).toBe(claim!.leaseOwner);

    // Clearing the lease in the same write is allowed.
    await prisma.$executeRaw`
      UPDATE "AgentTask"
      SET status = 'COMPLETED', "leaseOwner" = NULL, "leaseExpiresAt" = NULL
      WHERE id = ${ids.a}`;
    expect((await task(ids.a)).status).toBe("COMPLETED");
  });

  /**
   * A claims and is held in its handler; its lease is expired and swept back
   * to READY; B claims (same process) and is held. Returns both in-flight
   * executions and A's token.
   */
  async function takeOver(extraTasks = false) {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: slug, maxRetries: 3 },
      ...(extraTasks
        ? [{ key: "b", agentSlug: slug, status: "PENDING" as const, dependsOn: ["a"] }]
        : []),
    ]);
    const callA = nextCall();
    const callB = nextCall();

    const runA = executeTask(await task(ids.a), context(workflowId));
    await callA.started.promise;
    const tokenA = (await task(ids.a)).leaseOwner!;
    expect(tokenA).toBeTruthy();

    await expireLease(ids.a);
    expect((await sweepExpiredLeases({ workflowId })).reclaimed).toBe(1);

    const runB = executeTask(await task(ids.a), context(workflowId));
    await callB.started.promise;
    const before = await task(ids.a);
    expect(before.status).toBe("RUNNING");
    expect(before.attempts).toBe(2);
    expect(before.leaseOwner).not.toBe(tokenA);

    return { workflowId, ids, callA, callB, runA, runB, tokenA, before };
  }

  async function expectBUntouched(id: string, before: Awaited<ReturnType<typeof task>>) {
    const now = await task(id);
    expect(now.status).toBe("RUNNING");
    expect(now.leaseOwner).toBe(before.leaseOwner);
    expect(now.attempts).toBe(2);
    expect(now.output).toBeNull();
    expect(now.leaseExpiresAt!.getTime()).toBe(before.leaseExpiresAt!.getTime());
    expect(now.errorCode).toBe(before.errorCode);
  }

  it("[AC2] a late completion write by the reclaimed worker affects 0 rows; B's row survives and B completes", async () => {
    const { ids, callA, callB, runA, runB, tokenA, before } = await takeOver();

    callA.result.resolve(output("A-late", 123));
    const resultA = await runA;
    expect(resultA.status).toBe("LEASE_LOST");
    await expectBUntouched(ids.a, before);

    const aLogs = await logs(ids.a);
    expect(aLogs.some((l) => l.message.startsWith("Task completed"))).toBe(false);
    const lost = aLogs.find((l) => l.level === "warn" && l.message.startsWith("Lease lost"));
    expect(lost).toBeDefined();
    expect(JSON.parse(lost!.data!)).toMatchObject({
      staleLeaseOwner: tokenA,
      tokensUsed: 123,
      path: "completion",
    });

    callB.result.resolve(output("B"));
    expect((await runB).status).toBe("COMPLETED");
    const done = await task(ids.a);
    expect(done.status).toBe("COMPLETED");
    expect(JSON.parse(done.output!).data.tag).toBe("B");
    expect(done.attempts).toBe(2);
  });

  it("[AC2] a late retry (park) write by the reclaimed worker affects 0 rows; B's row survives", async () => {
    const { ids, callA, callB, runA, runB, tokenA, before } = await takeOver();

    callA.result.reject(new Error("503 server error from provider"));
    const resultA = await runA;
    expect(resultA.status).toBe("LEASE_LOST");
    await expectBUntouched(ids.a, before);
    const lost = (await logs(ids.a)).find((l) => l.message.startsWith("Lease lost"));
    expect(JSON.parse(lost!.data!)).toMatchObject({ staleLeaseOwner: tokenA, path: "retry" });

    callB.result.resolve(output("B"));
    expect((await runB).status).toBe("COMPLETED");
  });

  it("[AC2] a late terminal-failure write by the reclaimed worker affects 0 rows; B's row, its dependents and the workflow survive", async () => {
    const { workflowId, ids, callA, callB, runA, runB, tokenA, before } =
      await takeOver(true);

    callA.result.reject(new Error("invalid input payload"));
    const resultA = await runA;
    expect(resultA.status).toBe("LEASE_LOST");
    await expectBUntouched(ids.a, before);
    expect((await task(ids.b)).status).toBe("PENDING");
    expect((await workflow(workflowId)).status).toBe("RUNNING");
    const lost = (await logs(ids.a)).find((l) => l.message.startsWith("Lease lost"));
    expect(JSON.parse(lost!.data!)).toMatchObject({ staleLeaseOwner: tokenA, path: "failure" });

    callB.result.resolve(output("B"));
    expect((await runB).status).toBe("COMPLETED");
  });
});
