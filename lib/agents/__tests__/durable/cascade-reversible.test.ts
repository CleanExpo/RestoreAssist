/**
 * RA-7999 slice 1a — [AC9] the failure cascade is reversible, against real
 * Postgres.
 *
 * A terminal failure skips the task's transitive PENDING dependents
 * (UPSTREAM_FAILED) and the workflow becomes terminal at once. Both re-queue
 * paths, resumeWorkflow and the dead-letter-review cron, put those dependents
 * back to PENDING in the same transaction, so after a re-queue the
 * dependents actually execute instead of the workflow completing with steps
 * missing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { advanceWorkflow, executeTask, resumeWorkflow } from "@/lib/agents";
import { reviewDeadLetterTasks } from "@/lib/cron/dead-letter-review";
import {
  cleanup,
  context,
  makeWorkflow,
  output,
  registerTestAgent,
  task,
  workflow,
} from "./fixtures";

/** Upstream fails while `failWith` is set; every handler call is recorded. */
let failWith: Error | null = null;
const ran: string[] = [];
let upstreamSlug = "";
let downstreamSlug = "";

async function drive(workflowId: string) {
  // Run READY tasks until the workflow stops producing work.
  for (let i = 0; i < 5; i++) {
    const { nextExecutable, status } = await advanceWorkflow(workflowId);
    if (nextExecutable.length === 0 || status !== "RUNNING") return status;
    for (const t of nextExecutable) {
      await executeTask(t, context(workflowId));
    }
  }
  return (await workflow(workflowId)).status;
}

describe.skipIf(!process.env.DATABASE_URL)("RA-7999 [AC9] reversible cascade", () => {
  beforeAll(async () => {
    upstreamSlug = await registerTestAgent("upstream", async () => {
      ran.push("upstream");
      if (failWith) throw failWith;
      return output("upstream");
    });
    downstreamSlug = await registerTestAgent("downstream", async () => {
      ran.push("downstream");
      return output("downstream");
    });
  });
  beforeEach(() => {
    ran.length = 0;
    failWith = null;
  });
  afterAll(async () => {
    await cleanup();
  });

  async function failedChain(attemptsBefore: number, error: Error) {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: upstreamSlug, attempts: attemptsBefore, maxRetries: 3 },
      { key: "b", agentSlug: downstreamSlug, status: "PENDING", dependsOn: ["a"] },
      { key: "c", agentSlug: downstreamSlug, status: "PENDING", dependsOn: ["b"] },
    ]);
    failWith = error;
    const result = await executeTask(await task(ids.a), context(workflowId));
    expect(result.status).toBe("FAILED");
    failWith = null;

    for (const key of ["b", "c"]) {
      const dep = await task(ids[key]);
      expect(dep.status).toBe("SKIPPED");
      expect(dep.errorCode).toBe("UPSTREAM_FAILED");
    }
    expect((await workflow(workflowId)).status).toBe("FAILED");
    return { workflowId, ids };
  }

  it("[AC9] after a cascade, resumeWorkflow re-queues and the skipped dependents execute", async () => {
    const { workflowId, ids } = await failedChain(0, new Error("invalid payload"));
    expect((await task(ids.a)).status).toBe("FAILED");

    await resumeWorkflow(workflowId);
    expect((await task(ids.b)).status).toBe("PENDING");
    expect((await task(ids.b)).errorCode).toBeNull();
    ran.length = 0;

    const status = await drive(workflowId);

    expect(ran).toEqual(["upstream", "downstream", "downstream"]);
    for (const key of ["a", "b", "c"]) {
      expect((await task(ids[key])).status).toBe("COMPLETED");
    }
    expect(status).toBe("COMPLETED");
  });

  it("[AC9] after a cascade, the dead-letter-review re-queue leads to the skipped dependents executing", async () => {
    // attempts 2 before the claim: the claim makes it 3 = maxRetries, so a
    // retryable TIMEOUT dead-letters instead of parking.
    const { workflowId, ids } = await failedChain(2, new Error("request timed out"));
    const a = await task(ids.a);
    expect(a.status).toBe("DEAD_LETTER");
    expect(a.errorCode).toBe("TIMEOUT");

    await prisma.$executeRaw`
      UPDATE "AgentTask"
      SET "updatedAt" = (now() AT TIME ZONE 'UTC') - interval '31 minutes'
      WHERE id = ${ids.a}`;
    const review = await reviewDeadLetterTasks();
    expect(review.metadata?.requeued).toBeGreaterThanOrEqual(1);
    expect((await task(ids.a)).status).toBe("READY");
    expect((await task(ids.b)).status).toBe("PENDING");
    expect((await workflow(workflowId)).status).toBe("RUNNING");
    ran.length = 0;

    const status = await drive(workflowId);

    expect(ran).toEqual(["upstream", "downstream", "downstream"]);
    expect((await task(ids.c)).status).toBe("COMPLETED");
    expect(status).toBe("COMPLETED");
  });

  it("[AC9] un-skip keeps dependents of a task that is still failed skipped", async () => {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: upstreamSlug, maxRetries: 3 },
      { key: "x", agentSlug: upstreamSlug, maxRetries: 1 },
      { key: "b", agentSlug: downstreamSlug, status: "PENDING", dependsOn: ["a"] },
      { key: "y", agentSlug: downstreamSlug, status: "PENDING", dependsOn: ["x"] },
    ]);
    // Both fail non-retryably: a is FAILED, x (one attempt) is DEAD_LETTER
    // with VALIDATION_ERROR, which dead-letter-review never re-queues.
    failWith = new Error("invalid payload");
    await executeTask(await task(ids.a), context(workflowId));
    await executeTask(await task(ids.x), context(workflowId));
    failWith = null;
    expect((await task(ids.x)).status).toBe("DEAD_LETTER");
    expect((await task(ids.y)).status).toBe("SKIPPED");

    // Make only a eligible for the review's re-queue.
    await prisma.$executeRaw`
      UPDATE "AgentTask" SET status = 'DEAD_LETTER', "errorCode" = 'TIMEOUT',
        "updatedAt" = (now() AT TIME ZONE 'UTC') - interval '31 minutes'
      WHERE id = ${ids.a}`;
    await reviewDeadLetterTasks();

    expect((await task(ids.b)).status).toBe("PENDING");
    const y = await task(ids.y);
    expect(y.status).toBe("SKIPPED");
    expect(y.errorCode).toBe("UPSTREAM_FAILED");
  });
});
