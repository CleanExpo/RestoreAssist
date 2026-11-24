/**
 * RA-8000 slice 1b — POST /api/agents/workflows/[id]/tasks/[taskId]/approve,
 * and the resume and execute routes' behaviour for a paused workflow.
 * Real Postgres; mocked: the session and the rate limiter.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncToDatabase } from "@/lib/agents";
import { POST } from "../route";
import { POST as resumePOST } from "../../../../resume/route";
import { POST as executePOST } from "../../../../execute/route";
import {
  cleanupTenancy,
  seedTenancy,
  type SeededTenancy,
} from "../../../../../__tests__/agent-route-fixtures";

const HAS_DB = !!process.env.DATABASE_URL;
let seed: SeededTenancy;

async function pausedWorkflow(userId: string) {
  const wf = await prisma.agentWorkflow.create({
    data: {
      name: "approve route test",
      userId,
      taskGraph: "{}",
      status: "PAUSED",
      totalTasks: 2,
      lastActivityAt: new Date(),
    },
  });
  const input = JSON.stringify({ userId, data: {} });
  const a = await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "report-analysis",
      taskType: "analyze",
      displayName: "analyze",
      input,
      status: "COMPLETED",
    },
  });
  const b = await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "classification",
      taskType: "classify",
      displayName: "classify",
      sequenceOrder: 1,
      dependsOnTaskIds: [a.id],
      input,
      status: "AWAITING_APPROVAL",
      requiresApproval: true,
      approvalRequestedAt: new Date(),
    },
  });
  return { workflowId: wf.id, taskId: b.id };
}

function approve(
  workflowId: string,
  taskId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return POST(
    new NextRequest(
      `http://localhost/api/agents/workflows/${workflowId}/tasks/${taskId}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: workflowId, taskId }) },
  );
}

describe.skipIf(!HAS_DB)("RA-8000 approve route", () => {
  beforeAll(async () => {
    await syncToDatabase();
    seed = await seedTenancy();
  });
  afterAll(async () => {
    await cleanupTenancy(seed);
  });
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: seed.ownerA } });
  });

  it("401 without a session, and nothing changes", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    getServerSession.mockResolvedValue(null);
    const res = await approve(workflowId, taskId, { decision: "approve" });
    expect(res.status).toBe(401);
    expect(
      (await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status,
    ).toBe("AWAITING_APPROVAL");
  });

  it("400 for a body carrying approvedBy, an unknown decision or an over-long note", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    for (const body of [
      { decision: "approve", approvedBy: seed.ownerB },
      { decision: "maybe" },
      { decision: "approve", note: "x".repeat(1001) },
      {},
      "{not json",
    ]) {
      const res = await approve(workflowId, taskId, body);
      expect(res.status).toBe(400);
    }
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(t.status).toBe("AWAITING_APPROVAL");
    expect(t.approvedBy).toBeNull();
  });

  it("404 for another tenant's task, with no write", async () => {
    const theirs = await pausedWorkflow(seed.ownerB);
    const res = await approve(theirs.workflowId, theirs.taskId, { decision: "approve" });
    expect(res.status).toBe(404);
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: theirs.taskId } });
    expect(t.status).toBe("AWAITING_APPROVAL");
    expect(t.approvedAt).toBeNull();
  });

  it("404 for a task id taken from another workflow of the same user", async () => {
    const first = await pausedWorkflow(seed.ownerA);
    const second = await pausedWorkflow(seed.ownerA);
    const res = await approve(second.workflowId, first.taskId, { decision: "approve" });
    expect(res.status).toBe(404);
  });

  it("approve: 200, approvedBy is the session user, workflow RUNNING", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    const res = await approve(workflowId, taskId, { decision: "approve", note: "ok" });
    expect(res.status).toBe(200);
    const t = await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(t).toMatchObject({ status: "READY", approvedBy: seed.ownerA });
    expect(
      (await prisma.agentWorkflow.findUniqueOrThrow({ where: { id: workflowId } })).status,
    ).toBe("RUNNING");
  });

  it("a second decision is a structured 409 from the handler, naming the winning decision", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    await approve(workflowId, taskId, { decision: "approve" });
    const res = await approve(workflowId, taskId, { decision: "reject" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.fields).toEqual({
      taskStatus: "READY",
      workflowStatus: "RUNNING",
      decision: "approve",
    });
  });

  it("a 409 is not cached for replay under the same Idempotency-Key", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    const records = () => prisma.idempotencyRecord.count({ where: { scope: seed.ownerA } });
    const base = await records();
    const second = await pausedWorkflow(seed.ownerA);
    // Positive control: a 200 under a key leaves a stored record.
    const ok = await approve(second.workflowId, second.taskId, { decision: "approve" }, { "Idempotency-Key": `ra8000-${Date.now()}-key-ok` });
    expect(ok.status).toBe(200);
    expect(await records()).toBe(base + 1);
    // The 409 under its own key stores nothing: the record count is unchanged.
    const first = await approve(second.workflowId, second.taskId, { decision: "approve" }, { "Idempotency-Key": `ra8000-${Date.now()}-key-conflict` });
    expect(first.status).toBe(409);
    expect(await records()).toBe(base + 1);
    void workflowId;
    void taskId;
  });

  it("concurrent approvals with distinct keys give exactly one 200 and one handler 409", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    const [r1, r2] = await Promise.all([
      approve(workflowId, taskId, { decision: "approve" }, { "Idempotency-Key": `ra8000-${Date.now()}-key-one` }),
      approve(workflowId, taskId, { decision: "approve" }, { "Idempotency-Key": `ra8000-${Date.now()}-key-two` }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect((await loser.json()).error.code).toBe("CONFLICT");
  });

  it("resume on a paused workflow is a 409 naming the waiting task, and a later approve works", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    const res = await resumePOST(
      new NextRequest(`http://localhost/api/agents/workflows/${workflowId}/resume`, { method: "POST" }),
      { params: Promise.resolve({ id: workflowId }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.fields).toEqual({ taskId });
    expect(
      (await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status,
    ).toBe("AWAITING_APPROVAL");
    expect((await approve(workflowId, taskId, { decision: "approve" })).status).toBe(200);
  });

  it("execute on a paused workflow runs nothing and reports the waiting task", async () => {
    const { workflowId, taskId } = await pausedWorkflow(seed.ownerA);
    const res = await executePOST(
      new NextRequest(`http://localhost/api/agents/workflows/${workflowId}/execute`, { method: "POST" }),
      { params: Promise.resolve({ id: workflowId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PAUSED");
    expect(body.tasksExecuted).toBe(0);
    expect(body.awaitingApproval).toMatchObject({ taskId, displayName: "classify" });
  });
});
