/**
 * RA-8000 slice 1b — approval pauses in the agent engine, against real Postgres.
 *
 * Each case names the mutant that must turn it red. The state invariant under
 * test: a workflow is PAUSED exactly while a task waits in AWAITING_APPROVAL,
 * and only approve, reject or cancel move it out.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  advanceWorkflow,
  cancelWorkflow,
  claimTask,
  createWorkflow,
  executeTask,
  getExecutableTasks,
  resumeWorkflow,
} from "@/lib/agents";
import { decideApproval } from "@/lib/agents/approval";
import { unskipUpstreamFailed } from "@/lib/agents/lease";
import type { AgentSlug, WorkflowDefinition } from "@/lib/agents/types";
import {
  OTHER_USER_ID,
  USER_ID,
  cleanup,
  context,
  deferred,
  logs,
  makeWorkflow,
  output,
  registerTestAgent,
  task,
  workflow,
} from "../durable/fixtures";

const calls: string[] = [];
let slugA = "";
let slugB = "";

function twoStepDefinition(flagB: boolean, flagA = false): WorkflowDefinition {
  const step = (
    id: string,
    slug: string,
    group: number,
    dependsOn: string[],
    requiresApproval: boolean,
  ) => ({
    id,
    agentSlug: slug as AgentSlug,
    taskType: id,
    displayName: id,
    parallelGroup: group,
    dependsOn,
    optional: false,
    requiresApproval,
    inputMapping: () => ({ userId: USER_ID, data: {} }),
  });
  return {
    name: "RA-8000 test workflow",
    description: "approval test",
    steps: [
      step("a", slugA, 0, [], flagA),
      step("b", slugB, 1, ["a"], flagB),
    ],
  };
}

/** Run every READY task once, as one execute poll does. */
async function poll(workflowId: string) {
  const { nextExecutable } = await advanceWorkflow(workflowId);
  for (const t of nextExecutable) {
    await executeTask(t, context(workflowId));
  }
  return nextExecutable.length;
}

describe.skipIf(!process.env.DATABASE_URL)("RA-8000 approval engine", () => {
  beforeAll(async () => {
    slugA = await registerTestAgent("step-a", async () => {
      calls.push("a");
      return output("a");
    });
    slugB = await registerTestAgent("step-b", async () => {
      calls.push("b");
      return output("b");
    });
  });
  beforeEach(() => {
    calls.length = 0;
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("workflow status writes are compare-and-swaps", () => {
    it("a cancelled workflow is not relabelled COMPLETED by an in-flight task (mutant: unconditional status write)", async () => {
      const gate = deferred<void>();
      const slow = await registerTestAgent("slow", async () => {
        await gate.promise;
        return output("slow");
      });
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slow },
        { key: "b", agentSlug: slugB, status: "PENDING", dependsOn: ["a"] },
      ]);
      const running = executeTask(await task(ids.a), context(workflowId));
      // The claim has landed once a is RUNNING.
      for (let i = 0; i < 200 && (await task(ids.a)).status !== "RUNNING"; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await cancelWorkflow(workflowId);
      gate.resolve();
      await running;
      await advanceWorkflow(workflowId);
      expect((await workflow(workflowId)).status).toBe("CANCELLED");
    });

    it("one in-flight task and no cancelled task: the cancel still wins over the task's completion (mutant: unconditional status write)", async () => {
      const gate = deferred<void>();
      const slow = await registerTestAgent("slow-only", async () => {
        await gate.promise;
        return output("slow");
      });
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slow }]);
      const running = executeTask(await task(ids.a), context(workflowId));
      for (let i = 0; i < 200 && (await task(ids.a)).status !== "RUNNING"; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await cancelWorkflow(workflowId);
      gate.resolve();
      await running;
      await advanceWorkflow(workflowId);
      expect((await task(ids.a)).status).toBe("COMPLETED");
      expect((await workflow(workflowId)).status).toBe("CANCELLED");
    });

    it("progress never computes COMPLETED when a task is cancelled (mutant: drop cancelled > 0)", async () => {
      const { workflowId } = await makeWorkflow([
        { key: "a", agentSlug: slugA, status: "COMPLETED" },
        { key: "b", agentSlug: slugB, status: "CANCELLED" },
      ]);
      await advanceWorkflow(workflowId);
      expect((await workflow(workflowId)).status).not.toBe("COMPLETED");
    });

    it("a PAUSED workflow keeps PAUSED through a progress refresh (mutant: write RUNNING over PAUSED)", async () => {
      const { workflowId } = await makeWorkflow(
        [
          { key: "a", agentSlug: slugA, status: "COMPLETED" },
          {
            key: "b",
            agentSlug: slugB,
            status: "AWAITING_APPROVAL",
            requiresApproval: true,
            approvalRequestedAt: new Date(),
            dependsOn: ["a"],
          },
        ],
        { status: "PAUSED" },
      );
      await advanceWorkflow(workflowId);
      expect((await workflow(workflowId)).status).toBe("PAUSED");
    });
  });

  describe("the claim refuses unapproved tasks", () => {
    it("a READY flagged task without approval is not claimed and the handler never runs (mutant: drop the claim's approval clause)", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "b", agentSlug: slugB, requiresApproval: true },
      ]);
      expect(await claimTask(ids.b, 15_000)).toBeNull();
      await executeTask(await task(ids.b), context(workflowId));
      expect(calls).toEqual([]);
      expect((await task(ids.b)).status).toBe("READY");
    });

    it("positive control: the same task claims and runs once approvedAt is set", async () => {
      const { workflowId, ids } = await makeWorkflow([
        {
          key: "b",
          agentSlug: slugB,
          requiresApproval: true,
          approvedAt: new Date(),
        },
      ]);
      await executeTask(await task(ids.b), context(workflowId));
      expect(calls).toEqual(["b"]);
    });
  });

  describe("pause", () => {
    it("promotes a flagged task to AWAITING_APPROVAL and pauses the workflow; nothing runs (mutant: promote to READY regardless)", async () => {
      const created = await createWorkflow(twoStepDefinition(true), { userId: USER_ID });
      await poll(created.workflowId); // runs a
      await poll(created.workflowId); // would run b if it were READY
      const rows = await prisma.agentTask.findMany({
        where: { workflowId: created.workflowId },
        orderBy: { sequenceOrder: "asc" },
      });
      expect(rows.map((r) => r.status)).toEqual(["COMPLETED", "AWAITING_APPROVAL"]);
      expect(rows[1].approvalRequestedAt).not.toBeNull();
      expect(rows[1].requiresApproval).toBe(true);
      expect((await workflow(created.workflowId)).status).toBe("PAUSED");
      expect(calls).toEqual(["a"]);
    });

    it("reads the task row, not the definition: requiresApproval=false under a flagged step goes READY (mutant: read the definition)", async () => {
      const created = await createWorkflow(twoStepDefinition(true), { userId: USER_ID });
      await prisma.agentTask.updateMany({
        where: { workflowId: created.workflowId, taskType: "b" },
        data: { requiresApproval: false },
      });
      await poll(created.workflowId);
      await poll(created.workflowId);
      const b = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "b" },
      });
      expect(["READY", "COMPLETED"]).toContain(b.status);
      expect(calls).toContain("b");
    });

    it("an unflagged workflow still finishes COMPLETED, dependents wired to real task ids", async () => {
      const created = await createWorkflow(twoStepDefinition(false), { userId: USER_ID });
      for (let i = 0; i < 4; i++) await poll(created.workflowId);
      expect(calls).toEqual(["a", "b"]);
      expect((await workflow(created.workflowId)).status).toBe("COMPLETED");
    });

    it("a flagged root task is created AWAITING_APPROVAL in a PAUSED workflow, and approve succeeds (mutant: create the root task READY)", async () => {
      const created = await createWorkflow(twoStepDefinition(false, true), { userId: USER_ID });
      const wf = await workflow(created.workflowId);
      expect(wf.status).toBe("PAUSED");
      const a = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "a" },
      });
      expect(a.status).toBe("AWAITING_APPROVAL");
      expect(a.approvalRequestedAt).not.toBeNull();
      await poll(created.workflowId);
      expect(calls).toEqual([]);

      const result = await decideApproval({
        userId: USER_ID,
        workflowId: created.workflowId,
        taskId: a.id,
        decision: "approve",
      });
      expect(result.ok).toBe(true);
      expect((await workflow(created.workflowId)).status).toBe("RUNNING");
      expect((await task(a.id)).status).toBe("READY");
    });

    it("pause and approve survive a module restart, and approval does not rerun earlier steps", async () => {
      const created = await createWorkflow(twoStepDefinition(true), { userId: USER_ID });
      await poll(created.workflowId);
      await poll(created.workflowId);
      const bId = (
        await prisma.agentTask.findFirstOrThrow({
          where: { workflowId: created.workflowId, taskType: "b" },
        })
      ).id;
      expect(calls).toEqual(["a"]);

      // State lives in the database: nothing in memory carries the pause.
      vi.resetModules();
      const fresh = await import("@/lib/agents/approval");
      const result = await fresh.decideApproval({
        userId: USER_ID,
        workflowId: created.workflowId,
        taskId: bId,
        decision: "approve",
      });
      expect(result.ok).toBe(true);
      await poll(created.workflowId);
      expect(calls).toEqual(["a", "b"]); // a ran once; b ran after approval
    });
  });

  describe("approve and reject", () => {
    async function paused() {
      const created = await createWorkflow(twoStepDefinition(true), { userId: USER_ID });
      await poll(created.workflowId);
      await poll(created.workflowId);
      const b = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "b" },
      });
      return { workflowId: created.workflowId, taskId: b.id };
    }

    it("approve: task READY, approvedAt and approvedBy set, workflow RUNNING, one decision log row", async () => {
      const { workflowId, taskId } = await paused();
      const result = await decideApproval({
        userId: USER_ID,
        workflowId,
        taskId,
        decision: "approve",
        note: "go ahead",
      });
      expect(result).toMatchObject({ ok: true, decision: "approve" });
      const t = await task(taskId);
      expect(t.status).toBe("READY");
      expect(t.approvedAt).not.toBeNull();
      expect(t.approvedBy).toBe(USER_ID);
      expect((await workflow(workflowId)).status).toBe("RUNNING");
      const decisionLogs = (await logs(taskId)).filter((l) => l.message.includes("approval decision"));
      expect(decisionLogs).toHaveLength(1);
      expect(JSON.parse(decisionLogs[0].data ?? "{}")).toMatchObject({
        decision: "approve",
        actorId: USER_ID,
        note: "go ahead",
      });
    });

    it("reject: task CANCELLED, dependents SKIPPED REJECTED_BY_USER, workflow CANCELLED, handler never runs", async () => {
      const created = await createWorkflow(
        {
          ...twoStepDefinition(true),
          steps: [
            ...twoStepDefinition(true).steps,
            {
              id: "c",
              agentSlug: slugB as AgentSlug,
              taskType: "c",
              displayName: "c",
              parallelGroup: 2,
              dependsOn: ["b"],
              optional: false,
              inputMapping: () => ({ userId: USER_ID, data: {} }),
            },
          ],
        },
        { userId: USER_ID },
      );
      await poll(created.workflowId);
      await poll(created.workflowId);
      const b = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "b" },
      });
      const result = await decideApproval({
        userId: USER_ID,
        workflowId: created.workflowId,
        taskId: b.id,
        decision: "reject",
      });
      expect(result).toMatchObject({ ok: true, decision: "reject" });
      expect((await task(b.id)).status).toBe("CANCELLED");
      const c = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "c" },
      });
      expect(c.status).toBe("SKIPPED");
      expect(c.errorCode).toBe("REJECTED_BY_USER");
      expect((await workflow(created.workflowId)).status).toBe("CANCELLED");

      await advanceWorkflow(created.workflowId);
      expect((await workflow(created.workflowId)).status).toBe("CANCELLED");
      expect(await getExecutableTasks(created.workflowId)).toEqual([]);
      expect(calls).toEqual(["a"]);

      // The failure-cascade un-skip resets UPSTREAM_FAILED only.
      await prisma.$transaction((tx) => unskipUpstreamFailed(tx, created.workflowId));
      expect((await task(c.id)).status).toBe("SKIPPED");
    });

    it("another tenant gets NOT_FOUND and nothing is written (mutant: drop workflow.userId from the update where)", async () => {
      const { workflowId, taskId } = await paused();
      const result = await decideApproval({
        userId: OTHER_USER_ID,
        workflowId,
        taskId,
        decision: "approve",
      });
      expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
      const t = await task(taskId);
      expect(t.status).toBe("AWAITING_APPROVAL");
      expect(t.approvedAt).toBeNull();
      expect((await workflow(workflowId)).status).toBe("PAUSED");
    });

    it("ownership changing between the read and the write is caught by the write's own tenant scope (mutant: drop workflow.userId from the update where, keeping the pre-read)", async () => {
      const { workflowId, taskId } = await paused();
      const result = await decideApproval(
        { userId: USER_ID, workflowId, taskId, decision: "approve" },
        {
          afterRead: async () => {
            await prisma.agentWorkflow.update({
              where: { id: workflowId },
              data: { userId: OTHER_USER_ID },
            });
          },
        },
      );
      expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
      const t = await task(taskId);
      expect(t.status).toBe("AWAITING_APPROVAL");
      expect(t.approvedAt).toBeNull();
    });

    it("the task moving to another workflow between the read and the write writes nothing (mutant: drop the task-to-workflow check from the write)", async () => {
      const { workflowId, taskId } = await paused();
      const other = await paused();
      const result = await decideApproval(
        { userId: USER_ID, workflowId, taskId, decision: "approve" },
        {
          afterRead: async () => {
            await prisma.agentTask.update({
              where: { id: taskId },
              data: { workflowId: other.workflowId },
            });
          },
        },
      );
      expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
      expect((await task(taskId)).status).toBe("AWAITING_APPROVAL");
    });

    it("a task id from another workflow of the same user gets NOT_FOUND (mutant: drop the task-to-workflow check)", async () => {
      const first = await paused();
      const second = await paused();
      const result = await decideApproval({
        userId: USER_ID,
        workflowId: second.workflowId,
        taskId: first.taskId,
        decision: "approve",
      });
      expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
      expect((await task(first.taskId)).status).toBe("AWAITING_APPROVAL");
    });

    it("a second decision is a CONFLICT naming the winning decision, with no second write", async () => {
      const { workflowId, taskId } = await paused();
      await decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" });
      const approvedAt = (await task(taskId)).approvedAt;
      const again = await decideApproval({
        userId: USER_ID,
        workflowId,
        taskId,
        decision: "reject",
      });
      expect(again).toMatchObject({
        ok: false,
        reason: "CONFLICT",
        decision: "approve",
        taskStatus: "READY",
        workflowStatus: "RUNNING",
      });
      expect((await task(taskId)).approvedAt?.getTime()).toBe(approvedAt?.getTime());
      expect((await workflow(workflowId)).status).toBe("RUNNING");
    });

    it("two concurrent approvals give exactly one transition (mutant: drop the compare-and-swap)", async () => {
      const { workflowId, taskId } = await paused();
      const results = await Promise.all([
        decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" }),
        decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.reason === "CONFLICT")).toHaveLength(1);
      expect(
        (await logs(taskId)).filter((l) => l.message.includes("approval decision")),
      ).toHaveLength(1);
    });

    it("a forced interleave: A is held after its read, B completes, A is released (mutant: split the transaction)", async () => {
      const { workflowId, taskId } = await paused();
      const held = deferred<void>();
      const reached = deferred<void>();
      const a = decideApproval(
        { userId: USER_ID, workflowId, taskId, decision: "approve" },
        {
          afterRead: async () => {
            reached.resolve();
            await held.promise;
          },
        },
      );
      await reached.promise;
      const b = await decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" });
      expect(b.ok).toBe(true);
      held.resolve();
      const aResult = await a;
      expect(aResult).toMatchObject({ ok: false, reason: "CONFLICT" });
    });

    it("a throw between the transaction's steps leaves the task AWAITING_APPROVAL and one poll runs nothing", async () => {
      const { workflowId, taskId } = await paused();
      await expect(
        decideApproval(
          { userId: USER_ID, workflowId, taskId, decision: "approve" },
          {
            afterTaskUpdate: async () => {
              throw new Error("injected");
            },
          },
        ),
      ).rejects.toThrow("injected");
      const t = await task(taskId);
      expect(t.status).toBe("AWAITING_APPROVAL");
      expect(t.approvedAt).toBeNull();
      expect((await workflow(workflowId)).status).toBe("PAUSED");
      await poll(workflowId);
      expect(calls).toEqual(["a"]);
    });
  });

  describe("the other exits from PAUSED cannot bypass approval", () => {
    async function paused() {
      const created = await createWorkflow(twoStepDefinition(true), { userId: USER_ID });
      await poll(created.workflowId);
      await poll(created.workflowId);
      const b = await prisma.agentTask.findFirstOrThrow({
        where: { workflowId: created.workflowId, taskType: "b" },
      });
      return { workflowId: created.workflowId, taskId: b.id };
    }

    it("resume on a workflow holding an AWAITING_APPROVAL task refuses and changes nothing; a later approve succeeds (mutant: re-add PAUSED to resume)", async () => {
      const { workflowId, taskId } = await paused();
      await expect(resumeWorkflow(workflowId)).rejects.toMatchObject({
        name: "ApprovalPendingError",
        taskId,
      });
      expect((await task(taskId)).status).toBe("AWAITING_APPROVAL");
      expect((await workflow(workflowId)).status).toBe("PAUSED");
      const ok = await decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" });
      expect(ok.ok).toBe(true);
    });

    it("cancel cancels the waiting task; a later approve is a CONFLICT with zero handler calls", async () => {
      const { workflowId, taskId } = await paused();
      await cancelWorkflow(workflowId);
      expect((await task(taskId)).status).toBe("CANCELLED");
      expect((await workflow(workflowId)).status).toBe("CANCELLED");
      const result = await decideApproval({ userId: USER_ID, workflowId, taskId, decision: "approve" });
      expect(result).toMatchObject({ ok: false, reason: "CONFLICT" });
      await poll(workflowId);
      expect(calls).toEqual(["a"]);
    });

    it("a dead-letter-review style re-queue (READY, approvedAt null) is refused at the claim", async () => {
      const { workflowId, taskId } = await paused();
      // Simulate any writer that sets READY without approval.
      await prisma.$executeRaw`UPDATE "AgentTask" SET status = 'READY' WHERE id = ${taskId}`;
      await executeTask(await task(taskId), context(workflowId));
      expect(calls).toEqual(["a"]);
      expect((await task(taskId)).status).toBe("READY");
    });

    it("the sweep leaves a PAUSED workflow's RUNNING task alone; the same row is reclaimed while RUNNING (positive control)", async () => {
      const { sweepExpiredLeases } = await import("@/lib/agents");
      const { expireLease } = await import("../durable/fixtures");
      const live = await makeWorkflow([{ key: "a", agentSlug: slugA }], { status: "RUNNING" });
      const claimed = await claimTask(live.ids.a, 15_000);
      expect(claimed).not.toBeNull();
      await expireLease(live.ids.a);
      await sweepExpiredLeases({ workflowId: live.workflowId });
      expect((await task(live.ids.a)).status).toBe("READY");

      const still = await makeWorkflow([{ key: "a", agentSlug: slugA }], { status: "PAUSED" });
      expect(await claimTask(still.ids.a, 15_000)).not.toBeNull();
      await expireLease(still.ids.a);
      await sweepExpiredLeases({ workflowId: still.workflowId });
      expect((await task(still.ids.a)).status).toBe("RUNNING");
    });
  });
});
