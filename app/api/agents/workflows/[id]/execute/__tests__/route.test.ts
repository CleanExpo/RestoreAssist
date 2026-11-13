/**
 * RA-8001 slice 1d-i — POST /api/agents/workflows/[id]/execute.
 *
 * [AC3] G1 at execute, [AC5] a gate DB error is a 503, [AC9] the key
 * preflight claims nothing. Real Postgres and the real executor; mocked: the
 * session, the rate limiter, the key resolver (real error classes), and the
 * SDK constructor and transport, which count provider requests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());
const gateOverride = vi.hoisted(() => ({ throws: null as Error | null }));
const reportError = vi.hoisted(() => vi.fn());
const anthropicCtor = vi.hoisted(() => vi.fn());
const tryClaudeModels = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/resolve-workspace-ai-key")>();
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  };
});
vi.mock("@/lib/billing/subscription-gate", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/subscription-gate")>();
  return {
    ...actual,
    hasActiveSubscription: async (userId: string) => {
      if (gateOverride.throws) throw gateOverride.throws;
      return actual.hasActiveSubscription(userId);
    },
  };
});
vi.mock("@/lib/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability")>();
  return {
    ...actual,
    reportError: (...args: Parameters<typeof actual.reportError>) => {
      reportError(...args);
    },
  };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  },
}));
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: (...args: unknown[]) => tryClaudeModels(...args),
  getClaudeModels: () => [{ name: "claude-test", maxTokens: 4000 }],
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncToDatabase } from "@/lib/agents";
import { POST } from "../route";
import {
  cleanupTenancy,
  seedQuickAssessment,
  seedTenancy,
  type SeededTenancy,
} from "../../../__tests__/agent-route-fixtures";

const HAS_DB = !!process.env.DATABASE_URL;
const byok = { workspaceId: "ws_1", apiKey: "sk-ant-workspace-fixture", source: "byok" };
const platform = { workspaceId: "platform-trial", apiKey: "sk-ant-platform-fixture", source: "platform" };

let seed: SeededTenancy;

async function execute(userId: string, workflowId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  const res = await POST(
    new NextRequest(`http://localhost/api/agents/workflows/${workflowId}/execute`, { method: "POST" }),
    { params: Promise.resolve({ id: workflowId }) },
  );
  return { status: res.status, body: await res.json() };
}

function analysisTask(id: string) {
  return prisma.agentTask.findUniqueOrThrow({ where: { id } });
}

function workflowStatus(id: string) {
  return prisma.agentWorkflow.findUniqueOrThrow({ where: { id } }).then((w) => w.status);
}

describe.skipIf(!HAS_DB)("RA-8001 POST /api/agents/workflows/[id]/execute", () => {
  beforeAll(async () => {
    seed = await seedTenancy();
    await syncToDatabase();
  });
  afterAll(async () => {
    await cleanupTenancy(seed);
  });
  beforeEach(() => {
    getServerSession.mockReset();
    resolveWorkspaceAiKey.mockReset();
    resolveWorkspaceAiKey.mockResolvedValue(byok);
    reportError.mockReset();
    anthropicCtor.mockReset();
    tryClaudeModels.mockReset();
    tryClaudeModels.mockResolvedValue({
      content: [{ type: "text", text: '{"affectedAreas":["Kitchen"]}' }],
      usage: { input_tokens: 5, output_tokens: 3 },
      model: "claude-test",
    });
    gateOverride.throws = null;
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  describe("[AC3] G1 at execute", () => {
    it("[AC3] an expired TRIAL gets 402 AI_SUBSCRIPTION_INACTIVE and claims 0 tasks", async () => {
      const { workflowId, analysisTaskId } = await seedQuickAssessment(seed.expiredTrial);
      const { status, body } = await execute(seed.expiredTrial, workflowId);
      expect(status).toBe(402);
      expect(body.error.code).toBe("AI_SUBSCRIPTION_INACTIVE");
      const row = await analysisTask(analysisTaskId);
      expect(row.status).toBe("READY");
      expect(row.attempts).toBe(0);
      expect(await workflowStatus(workflowId)).toBe("PENDING");
      expect(tryClaudeModels).not.toHaveBeenCalled();
    });

    it("[AC3] a finished workflow stays readable for an expired plan (terminal early return first)", async () => {
      const { workflowId } = await seedQuickAssessment(seed.expiredTrial, "COMPLETED");
      const { status, body } = await execute(seed.expiredTrial, workflowId);
      expect(status).toBe(200);
      expect(body.status).toBe("COMPLETED");
    });

    it("[AC3] positive twin: an ACTIVE BYOK owner runs report-analysis with 1 request", async () => {
      const { workflowId, analysisTaskId } = await seedQuickAssessment(seed.ownerB);
      const { status, body } = await execute(seed.ownerB, workflowId);
      expect(status).toBe(200);
      expect(body.tasksExecuted).toBe(1);
      expect((await analysisTask(analysisTaskId)).status).toBe("COMPLETED");
      expect(tryClaudeModels).toHaveBeenCalledTimes(1);
    });
  });

  describe("[AC5] a gate DB error is a 503 at execute", () => {
    it("[AC5] execute: the subscription read throws -> 503 GOVERNOR_UNAVAILABLE, reported with reason and userId", async () => {
      const { workflowId, analysisTaskId } = await seedQuickAssessment(seed.ownerB);
      gateOverride.throws = new Error("connection reset");
      const { status, body } = await execute(seed.ownerB, workflowId);
      expect(status).toBe(503);
      expect(body.error.code).toBe("GOVERNOR_UNAVAILABLE");
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError.mock.calls[0][1]).toMatchObject({
        userId: seed.ownerB,
        reason: "subscription-gate",
        workflowId,
      });
      expect((await analysisTask(analysisTaskId)).attempts).toBe(0);
    });
  });

  describe("[AC9] key preflight at execute", () => {
    it("[AC9] a funded trial with no BYOK key gets 402 PAYMENT_REQUIRED and claims 0 tasks", async () => {
      resolveWorkspaceAiKey.mockResolvedValue(platform);
      const { workflowId, analysisTaskId } = await seedQuickAssessment(seed.fundedTrial);
      const { status, body } = await execute(seed.fundedTrial, workflowId);
      expect(status).toBe(402);
      expect(body.error.code).toBe("PAYMENT_REQUIRED");
      const row = await analysisTask(analysisTaskId);
      expect(row.status).toBe("READY");
      expect(row.attempts).toBe(0);
      expect(anthropicCtor).not.toHaveBeenCalled();
      expect(tryClaudeModels).not.toHaveBeenCalled();
    });
  });
});
