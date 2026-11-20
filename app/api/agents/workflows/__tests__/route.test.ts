/**
 * RA-8001 slice 1d-i — POST /api/agents/workflows (create).
 *
 * [AC3] G1 subscription gate, [AC4] tenancy on reportId/inspectionId,
 * [AC5] a gate DB error is a 503, [AC9] the key preflight. Real Postgres:
 * the subscription and tenancy reads run against seeded rows. Mocked: the
 * session, the rate limiter, the key resolver (its error classes stay real).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());
const gateOverride = vi.hoisted(() => ({ throws: null as Error | null }));
const reportError = vi.hoisted(() => vi.fn());

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

import { POST } from "../route";
import {
  cleanupTenancy,
  jsonRequest,
  seedTenancy,
  workflowCount,
  type SeededTenancy,
} from "./agent-route-fixtures";

const HAS_DB = !!process.env.DATABASE_URL;
const ROUTE_URL = "http://localhost/api/agents/workflows";
const byok = { workspaceId: "ws_1", apiKey: "sk-ant-workspace-fixture", source: "byok" };
const platform = { workspaceId: "platform-trial", apiKey: "sk-ant-platform-fixture", source: "platform" };

let seed: SeededTenancy;

function as(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

async function create(body: Record<string, unknown>) {
  const res = await POST(jsonRequest(ROUTE_URL, { workflow: "quick-assessment", ...body }));
  return { status: res.status, body: await res.json() };
}

describe.skipIf(!HAS_DB)("RA-8001 POST /api/agents/workflows", () => {
  beforeAll(async () => {
    seed = await seedTenancy();
  });
  afterAll(async () => {
    await cleanupTenancy(seed);
  });
  beforeEach(() => {
    getServerSession.mockReset();
    resolveWorkspaceAiKey.mockReset();
    resolveWorkspaceAiKey.mockResolvedValue(byok);
    reportError.mockReset();
    gateOverride.throws = null;
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  describe("[AC3] G1 subscription gate", () => {
    it("[AC3] an expired TRIAL gets 402 AI_SUBSCRIPTION_INACTIVE in the envelope and no row", async () => {
      as(seed.expiredTrial);
      const before = await workflowCount(seed.expiredTrial);
      const { status, body } = await create({});
      expect(status).toBe(402);
      expect(body.error.code).toBe("AI_SUBSCRIPTION_INACTIVE");
      expect(typeof body.error.message).toBe("string");
      expect(await workflowCount(seed.expiredTrial)).toBe(before);
      // G1 refuses before the key is even resolved.
      expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    });

    it("[AC3] positive twin: an ACTIVE BYOK owner gets 201 and exactly 1 workflow", async () => {
      as(seed.ownerB);
      const before = await workflowCount(seed.ownerB);
      const { status, body } = await create({});
      expect(status).toBe(201);
      expect(body.taskCount).toBe(3);
      expect(await workflowCount(seed.ownerB)).toBe(before + 1);
    });
  });

  describe("[AC4] tenancy on create", () => {
    it("[AC4] another tenant's inspectionId is 404 and writes no row", async () => {
      as(seed.ownerA);
      const before = await workflowCount(seed.ownerA);
      const { status, body } = await create({ inspectionId: seed.inspOwnerB });
      expect(status).toBe(404);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(await workflowCount(seed.ownerA)).toBe(before);
    });

    it("[AC4] another tenant's reportId is 404 and writes no row", async () => {
      as(seed.ownerA);
      const before = await workflowCount(seed.ownerA);
      const { status } = await create({ reportId: seed.reportOwnerB });
      expect(status).toBe(404);
      expect(await workflowCount(seed.ownerA)).toBe(before);
    });

    it("[AC4] a technician using a colleague's inspection (same org, no shared workspace) is 404", async () => {
      as(seed.techA);
      const before = await workflowCount(seed.techA);
      const { status } = await create({ inspectionId: seed.inspOwnerA });
      expect(status).toBe(404);
      expect(await workflowCount(seed.techA)).toBe(before);
    });

    it("[AC4] a technician using a colleague's report is 404", async () => {
      as(seed.techA);
      const before = await workflowCount(seed.techA);
      const { status } = await create({ reportId: seed.reportOwnerA });
      expect(status).toBe(404);
      expect(await workflowCount(seed.techA)).toBe(before);
    });

    it("[AC4] own inspection and report ids give 201", async () => {
      as(seed.techA);
      const before = await workflowCount(seed.techA);
      const { status } = await create({ inspectionId: seed.inspTechA, reportId: seed.reportTechA });
      expect(status).toBe(201);
      expect(await workflowCount(seed.techA)).toBe(before + 1);
    });

    it("[AC4] a non-string id is a 400 VALIDATION", async () => {
      as(seed.ownerA);
      const { status, body } = await create({ inspectionId: 42 });
      expect(status).toBe(400);
      expect(body.error.code).toBe("VALIDATION");
    });
  });

  describe("[AC5] a gate DB error is a 503", () => {
    it("[AC5] create: the subscription read throws -> 503 GOVERNOR_UNAVAILABLE, reported with reason and userId", async () => {
      as(seed.ownerB);
      gateOverride.throws = new Error("connection reset");
      const before = await workflowCount(seed.ownerB);
      const { status, body } = await create({});
      expect(status).toBe(503);
      expect(body.error.code).toBe("GOVERNOR_UNAVAILABLE");
      expect(await workflowCount(seed.ownerB)).toBe(before);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError.mock.calls[0][1]).toMatchObject({
        userId: seed.ownerB,
        reason: "subscription-gate",
      });
    });

    it("[AC5] create: the preflight read throws -> 503 GOVERNOR_UNAVAILABLE", async () => {
      as(seed.ownerB);
      resolveWorkspaceAiKey.mockRejectedValue(new Error("connection reset"));
      const before = await workflowCount(seed.ownerB);
      const { status, body } = await create({});
      expect(status).toBe(503);
      expect(body.error.code).toBe("GOVERNOR_UNAVAILABLE");
      expect(reportError.mock.calls[0][1]).toMatchObject({
        userId: seed.ownerB,
        reason: "key-preflight",
      });
      expect(await workflowCount(seed.ownerB)).toBe(before);
    });
  });

  describe("[AC9] key preflight at create", () => {
    it("[AC9] a funded trial with no BYOK key (platform source) gets 402 PAYMENT_REQUIRED and no row", async () => {
      as(seed.fundedTrial);
      resolveWorkspaceAiKey.mockResolvedValue(platform);
      const before = await workflowCount(seed.fundedTrial);
      const { status, body } = await create({});
      expect(status).toBe(402);
      expect(body.error.code).toBe("PAYMENT_REQUIRED");
      expect(body.error.message).toMatch(/your own Anthropic API key/);
      expect(await workflowCount(seed.fundedTrial)).toBe(before);
    });

    it("[AC9] no key at all (NoWorkspaceKeyError) is the same 402", async () => {
      as(seed.fundedTrial);
      const { NoWorkspaceKeyError } = await import("@/lib/ai/resolve-workspace-ai-key");
      resolveWorkspaceAiKey.mockRejectedValue(new NoWorkspaceKeyError("ANTHROPIC", "PLATFORM_NOT_READY"));
      const before = await workflowCount(seed.fundedTrial);
      const { status, body } = await create({});
      expect(status).toBe(402);
      expect(body.error.code).toBe("PAYMENT_REQUIRED");
      expect(await workflowCount(seed.fundedTrial)).toBe(before);
    });
  });
});
