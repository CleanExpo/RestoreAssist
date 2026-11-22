/**
 * RA-8000 — account deletion cancels the user's paused (non-terminal) agent
 * workflows and their waiting tasks, so nothing waits for an approval nobody
 * can give. Finished workflows are left as they were. Real database; runs when
 * DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncToDatabase } from "@/lib/agents";
import { POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra8000d-${Date.now().toString(36)}`;
const ids = { user: "", paused: "", pausedTask: "", pendingTask: "", done: "", doneTask: "" };

async function workflowWith(
  userId: string,
  status: "PAUSED" | "COMPLETED",
  tasks: Array<"AWAITING_APPROVAL" | "PENDING" | "COMPLETED">,
) {
  const wf = await prisma.agentWorkflow.create({
    data: { name: `${S} wf`, userId, taskGraph: "{}", status, totalTasks: tasks.length },
  });
  const created: string[] = [];
  for (const [i, taskStatus] of tasks.entries()) {
    const row = await prisma.agentTask.create({
      data: {
        workflowId: wf.id,
        agentSlug: "report-analysis",
        taskType: `t${i}`,
        displayName: `t${i}`,
        sequenceOrder: i,
        input: "{}",
        status: taskStatus,
        requiresApproval: taskStatus === "AWAITING_APPROVAL",
        approvalRequestedAt: taskStatus === "AWAITING_APPROVAL" ? new Date() : null,
      },
    });
    created.push(row.id);
  }
  return { id: wf.id, taskIds: created };
}

describe.skipIf(!HAS_DB)("account deletion and paused agent workflows (RA-8000)", () => {
  beforeAll(async () => {
    await syncToDatabase();
    const user = await prisma.user.create({
      data: { email: `${S}-u@test.local`, role: "USER" },
    });
    ids.user = user.id;
    const paused = await workflowWith(user.id, "PAUSED", ["AWAITING_APPROVAL", "PENDING"]);
    ids.paused = paused.id;
    [ids.pausedTask, ids.pendingTask] = paused.taskIds;
    const done = await workflowWith(user.id, "COMPLETED", ["COMPLETED"]);
    ids.done = done.id;
    ids.doneTask = done.taskIds[0];
  });

  afterAll(async () => {
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.agentWorkflow.deleteMany({ where: { name: `${S} wf` } }));
    await swallow(prisma.idempotencyRecord.deleteMany({ where: { scope: ids.user } }));
    await swallow(prisma.user.deleteMany({ where: { id: ids.user } }));
    await prisma.$disconnect();
  });

  it("cancels the paused workflow and its waiting tasks; leaves the finished one alone", async () => {
    getServerSession.mockResolvedValue({ user: { id: ids.user } });
    const res = await POST(
      new NextRequest("http://localhost/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
        headers: {
          "content-type": "application/json",
          host: "localhost",
          origin: "http://localhost",
          "idempotency-key": `${S}-${Math.random().toString(36).slice(2)}`,
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await prisma.user.count({ where: { id: ids.user } })).toBe(0);

    const paused = await prisma.agentWorkflow.findUniqueOrThrow({ where: { id: ids.paused } });
    expect(paused.status).toBe("CANCELLED");
    expect(paused.completedAt).not.toBeNull();
    for (const id of [ids.pausedTask, ids.pendingTask]) {
      expect((await prisma.agentTask.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    }

    expect((await prisma.agentWorkflow.findUniqueOrThrow({ where: { id: ids.done } })).status).toBe("COMPLETED");
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: ids.doneTask } })).status).toBe("COMPLETED");
  });
});
