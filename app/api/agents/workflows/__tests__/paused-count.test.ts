/**
 * RA-8000 — GET /api/agents/workflows reports the caller's paused workflows and
 * the oldest wait, from the database. A workflow paused 30 days ago still
 * counts; another tenant's paused workflow never does.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncToDatabase } from "@/lib/agents";
import { GET } from "../route";
import { cleanupTenancy, seedTenancy, type SeededTenancy } from "./agent-route-fixtures";

const HAS_DB = !!process.env.DATABASE_URL;
let seed: SeededTenancy;

async function pausedFor(userId: string, requestedAt: Date) {
  const wf = await prisma.agentWorkflow.create({
    data: { name: "paused count", userId, taskGraph: "{}", status: "PAUSED", totalTasks: 1 },
  });
  await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "classification",
      taskType: "classify",
      displayName: "classify",
      input: "{}",
      status: "AWAITING_APPROVAL",
      requiresApproval: true,
      approvalRequestedAt: requestedAt,
    },
  });
}

describe.skipIf(!HAS_DB)("GET /api/agents/workflows paused count (RA-8000)", () => {
  beforeAll(async () => {
    await syncToDatabase();
    seed = await seedTenancy();
  });
  afterAll(async () => {
    await cleanupTenancy(seed);
  });

  it("counts a workflow paused 30 days ago, reports the oldest wait, and ignores other tenants", async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await pausedFor(seed.ownerA, thirtyDaysAgo);
    await pausedFor(seed.ownerA, new Date());
    await pausedFor(seed.ownerB, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

    getServerSession.mockResolvedValue({ user: { id: seed.ownerA } });
    const res = await GET(new NextRequest("http://localhost/api/agents/workflows"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pausedAwaitingApproval.workflows).toBe(2);
    expect(body.pausedAwaitingApproval.tasks).toBe(2);
    expect(new Date(body.pausedAwaitingApproval.oldestApprovalRequestedAt).getTime()).toBe(
      thirtyDaysAgo.getTime(),
    );
  });
});
