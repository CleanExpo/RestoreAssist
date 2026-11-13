/**
 * RA-7999 slice 1a — the advance-workflows cron with the lease sweep, against
 * real Postgres (npm run test:db).
 *
 * [AC6]  The sweep runs before the stale check; a truly stale workflow is
 *        failed; the stale-fail write is a compare-and-swap; a fake clock past
 *        the deadline stops further claims; all items throwing fails the run;
 *        dry-run writes nothing; a PAUSED workflow is kept (regression pin).
 * [AC1]  The cron sweep reclaims a crashed claim, attempts exact.
 * [AC1b] A live lease with a stale lastActivityAt survives the cron.
 *
 * advanceWorkflow is wrapped (never replaced) so one test can change the
 * workflow's status between the stale query and the stale write.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  afterAdvance: null as null | ((workflowId: string) => Promise<void>),
}));
vi.mock("@/lib/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents")>();
  return {
    ...actual,
    advanceWorkflow: async (workflowId: string) => {
      const result = await actual.advanceWorkflow(workflowId);
      if (hooks.afterAdvance) await hooks.afterAdvance(workflowId);
      return result;
    },
  };
});

import { prisma } from "@/lib/prisma";
import { claimTask } from "@/lib/agents";
import { advanceWorkflows } from "../advance-workflows";
import {
  backdateWorkflowActivity,
  cleanup,
  cleanupWorkflows,
  expireLease,
  logs,
  makeWorkflow,
  output,
  registerTestAgent,
  setLegacyStartedAgo,
  task,
  workflow,
} from "@/lib/agents/__tests__/durable/fixtures";

const HOUR = 60 * 60 * 1000;
let calls = 0;
let slug = "";

describe.skipIf(!process.env.DATABASE_URL)("RA-7999 advance-workflows cron with leases", () => {
  beforeAll(async () => {
    slug = await registerTestAgent("cron", async () => {
      calls++;
      return output("cron");
    });
  });
  beforeEach(() => {
    calls = 0;
    hooks.afterAdvance = null;
  });
  afterEach(async () => {
    // advanceWorkflows reads every workflow, so each test starts empty.
    await cleanupWorkflows();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("[AC1] the cron sweep reclaims a crashed claim and runs it once more, attempts exact", async () => {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: slug, attempts: 0, maxRetries: 3 },
    ]);
    const claim = await claimTask(ids.a, 15_000);
    expect(claim!.attempts).toBe(1);
    await expireLease(ids.a);

    const result = await advanceWorkflows();

    expect(result.metadata).toMatchObject({ reclaimed: 1, deadLettered: 0, errors: 0 });
    expect(calls).toBe(1);
    const a = await task(ids.a);
    expect(a.status).toBe("COMPLETED");
    expect(a.attempts).toBe(2);
    expect((await workflow(workflowId)).status).toBe("COMPLETED");
    const reclaim = (await logs(ids.a)).find((l) => l.message.startsWith("Lease expired"));
    expect(JSON.parse(reclaim!.data!).previousLeaseOwner).toBe(claim!.leaseOwner);
  });

  it("[AC6] the sweep runs before the stale check: an expired-lease workflow is reclaimed, not failed", async () => {
    const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    await claimTask(ids.a, 15_000);
    await expireLease(ids.a);
    await backdateWorkflowActivity(workflowId, HOUR);

    const result = await advanceWorkflows();

    expect(result.metadata).toMatchObject({ reclaimed: 1 });
    expect(calls).toBe(1);
    const wf = await workflow(workflowId);
    expect(wf.status).toBe("COMPLETED");
    expect(wf.errorMessage).toBeNull();
  });

  it("[AC6] a truly stale workflow (lastActivityAt backdated after the claim) is failed", async () => {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: slug },
      // Waits on a dependency that can never complete.
      { key: "b", agentSlug: slug, status: "PENDING", dependsOn: ["a"] },
    ]);
    await prisma.agentTask.update({
      where: { id: ids.b },
      data: { dependsOnTaskIds: [ids.a, "never-completes"] },
    });
    await advanceWorkflows(); // claims and completes a
    expect((await task(ids.a)).status).toBe("COMPLETED");
    await backdateWorkflowActivity(workflowId, HOUR);

    const result = await advanceWorkflows();

    const wf = await workflow(workflowId);
    expect(wf.status).toBe("FAILED");
    expect(wf.errorMessage).toContain("stalled");
    expect((result.metadata as any).details).toContainEqual({
      workflowId,
      action: "stale-failed",
    });
  });

  it("[AC6] a workflow that changes status between the stale query and the write is not failed (compare-and-swap)", async () => {
    const { workflowId, ids } = await makeWorkflow([
      { key: "b", agentSlug: slug, status: "PENDING" },
    ]);
    await prisma.agentTask.update({
      where: { id: ids.b },
      data: { dependsOnTaskIds: ["never-completes"] },
    });
    await backdateWorkflowActivity(workflowId, HOUR);
    hooks.afterAdvance = async (id) => {
      if (id === workflowId) {
        await prisma.agentWorkflow.update({
          where: { id },
          data: { status: "PAUSED" },
        });
      }
    };

    const result = await advanceWorkflows();

    expect((await workflow(workflowId)).status).toBe("PAUSED");
    expect((result.metadata as any).details).toContainEqual({
      workflowId,
      action: "stale-changed",
    });
  });

  it("[AC6] with a fake clock past the deadline, no further claim happens and the remainder is reported", async () => {
    const { ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    let t = 1_000_000;
    const now = () => {
      const value = t;
      t += 250_000; // every later read is past start + 240 s
      return value;
    };

    const result = await advanceWorkflows({ now });

    expect(calls).toBe(0);
    const a = await task(ids.a);
    expect(a.status).toBe("READY");
    expect(a.attempts).toBe(0);
    expect(result.metadata).toMatchObject({ unprocessed: 1, deadlineReached: true });
  });

  it("[AC6] the same READY task is claimed with a clock inside the deadline (control)", async () => {
    const { ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    await advanceWorkflows({ now: () => 1_000_000 });
    expect(calls).toBe(1);
    expect((await task(ids.a)).status).toBe("COMPLETED");
  });

  it("[AC6] when every item throws, the run fails", async () => {
    // A workflow whose config is not JSON makes buildContext throw.
    await makeWorkflow([{ key: "a", agentSlug: slug }], { config: "not json" });

    await expect(advanceWorkflows()).rejects.toThrow(/all 1 item\(s\) failed/);
    expect(calls).toBe(0);
  });

  it("[AC6] dry-run reports what the sweep would reclaim and writes nothing", async () => {
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: slug },
      { key: "legacy", agentSlug: slug },
      { key: "ready", agentSlug: slug },
    ]);
    const claim = await claimTask(ids.a, 15_000);
    await expireLease(ids.a);
    await setLegacyStartedAgo(ids.legacy, 20 * 60 * 1000);
    const before = await prisma.agentTask.findMany({
      where: { workflowId },
      orderBy: { id: "asc" },
    });
    const logCount = await prisma.agentTaskLog.count({ where: { task: { workflowId } } });

    const result = await advanceWorkflows({ dryRun: true });

    expect(result.metadata).toMatchObject({
      dryRun: true,
      reclaimed: 1,
      legacyUnleased: 1,
      deadLettered: 0,
    });
    expect(calls).toBe(0);
    const after = await prisma.agentTask.findMany({
      where: { workflowId },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
    expect((await task(ids.a)).leaseOwner).toBe(claim!.leaseOwner);
    expect(await prisma.agentTaskLog.count({ where: { task: { workflowId } } })).toBe(logCount);
  });

  it("[AC6] regression pin only: a stale PAUSED workflow with an expired lease is kept, not failed or swept", async () => {
    const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }], {
      status: "PAUSED",
    });
    const claim = await claimTask(ids.a, 15_000);
    await expireLease(ids.a);
    await backdateWorkflowActivity(workflowId, HOUR);

    await advanceWorkflows();

    expect((await workflow(workflowId)).status).toBe("PAUSED");
    const a = await task(ids.a);
    expect(a.status).toBe("RUNNING");
    expect(a.leaseOwner).toBe(claim!.leaseOwner);
  });

  it("[AC1b] a live lease with a stale lastActivityAt survives the cron", async () => {
    const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
    const claim = await claimTask(ids.a, 15_000);
    await backdateWorkflowActivity(workflowId, HOUR);

    const result = await advanceWorkflows();

    expect(result.metadata).toMatchObject({ reclaimed: 0 });
    expect(calls).toBe(0);
    const a = await task(ids.a);
    expect(a.status).toBe("RUNNING");
    expect(a.leaseOwner).toBe(claim!.leaseOwner);
    expect((await workflow(workflowId)).status).toBe("RUNNING");
  });
});
