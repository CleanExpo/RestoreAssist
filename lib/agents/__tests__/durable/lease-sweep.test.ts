/**
 * RA-7999 slice 1a — crash recovery through the lease sweep, against real
 * Postgres (npm run test:db).
 *
 * [AC1]  A claimed-and-abandoned task is reclaimed by the execute-route sweep
 *        (and by the cron sweep, in advance-workflows-durable.test.ts), with
 *        exact attempt counts, LEASE_EXPIRED dead-lettering, the SKIPPED
 *        cascade and the reclaim log.
 * [AC1b] Over-reclaim controls: live leases, young legacy rows, PAUSED and
 *        terminal workflows.
 * [AC2c] The lease margin covers a delay of timeoutMs + 30 s after the claim.
 *
 * Session and rate limiting are mocked; Prisma is real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: async () => null,
}));
// RA-8001 added G1 to the execute route; these fixture users have no User
// row, so the plan is stubbed current. G1 itself is proven in
// app/api/agents/workflows/[id]/execute/__tests__/route.test.ts.
vi.mock("@/lib/billing/subscription-gate", () => ({
  hasActiveSubscription: async () => true,
}));

import { prisma } from "@/lib/prisma";
import { claimTask, sweepExpiredLeases, LEASE_MARGIN_MS } from "@/lib/agents";
import { PG_POOL_CONNECTION_TIMEOUT_MS } from "@/lib/prisma-pool-config";
import { POST as EXECUTE } from "@/app/api/agents/workflows/[id]/execute/route";
import {
  OTHER_USER_ID,
  USER_ID,
  ageLease,
  cleanup,
  expireLease,
  logs,
  makeWorkflow,
  output,
  registerTestAgent,
  setLegacyStartedAgo,
  task,
  workflow,
} from "./fixtures";

const TIMEOUT_MS = 15_000;
const MIN = 60_000;

let calls = 0;
let slug = "";

function execute(workflowId: string, userId = USER_ID) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  return EXECUTE(
    new NextRequest(`http://localhost/api/agents/workflows/${workflowId}/execute`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: workflowId }) },
  );
}

/** Claim the task (as a worker would) and abandon it with an expired lease. */
async function dieAfterClaim(taskId: string) {
  const claim = await claimTask(taskId, TIMEOUT_MS);
  expect(claim).not.toBeNull();
  await expireLease(taskId);
  return claim!;
}

describe.skipIf(!process.env.DATABASE_URL)("RA-7999 lease sweep", () => {
  beforeAll(async () => {
    slug = await registerTestAgent(
      "sweep",
      async () => {
        calls++;
        return output("sweep");
      },
      TIMEOUT_MS,
    );
  });
  beforeEach(() => {
    calls = 0;
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("[AC1] crash recovery", () => {
    it("[AC1] the execute-route sweep reclaims an expired lease and runs it once more, attempts exact", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slug, attempts: 1, maxRetries: 3 },
      ]);
      const claim = await dieAfterClaim(ids.a);
      expect(claim.attempts).toBe(2);

      const res = await execute(workflowId);
      expect(res.status).toBe(200);

      const a = await task(ids.a);
      expect(calls).toBe(1);
      expect(a.status).toBe("COMPLETED");
      expect(a.attempts).toBe(3);
      expect(a.leaseOwner).toBeNull();
      expect(a.leaseExpiresAt).toBeNull();

      const reclaim = (await logs(ids.a)).find(
        (l) => l.level === "warn" && l.message.startsWith("Lease expired"),
      );
      expect(reclaim).toBeDefined();
      const data = JSON.parse(reclaim!.data!);
      expect(data.previousLeaseOwner).toBe(claim.leaseOwner);
      expect(data.attempts).toBe(2);
      expect(data.startedAt).not.toBeNull();
    });

    it("[AC1] attempts = maxRetries - 1 before the claim: expiry dead-letters with LEASE_EXPIRED, zero handler calls, dependents SKIPPED, workflow terminal", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slug, attempts: 2, maxRetries: 3 },
        { key: "b", agentSlug: slug, status: "PENDING", dependsOn: ["a"] },
        { key: "c", agentSlug: slug, status: "PENDING", dependsOn: ["b"] },
      ]);
      const claim = await dieAfterClaim(ids.a);
      expect(claim.attempts).toBe(3);

      const res = await execute(workflowId);
      expect(res.status).toBe(200);
      const body = await res.json();

      const a = await task(ids.a);
      expect(calls).toBe(0);
      expect(a.status).toBe("DEAD_LETTER");
      expect(a.errorCode).toBe("LEASE_EXPIRED");
      expect(a.attempts).toBe(3);
      expect(a.leaseOwner).toBeNull();

      for (const key of ["b", "c"]) {
        const dep = await task(ids[key]);
        expect(dep.status).toBe("SKIPPED");
        expect(dep.errorCode).toBe("UPSTREAM_FAILED");
      }
      const wf = await workflow(workflowId);
      expect(wf.status).toBe("FAILED");
      expect(body.status).toBe("FAILED");

      const deadLog = (await logs(ids.a)).find((l) => l.level === "error");
      expect(deadLog?.message).toContain("LEASE_EXPIRED");
      expect(JSON.parse(deadLog!.data!).previousLeaseOwner).toBe(claim.leaseOwner);
    });

    it("[AC1] attempts = maxRetries - 2 before the claim: expiry returns the task to READY with attempts unchanged", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slug, attempts: 1, maxRetries: 3 },
      ]);
      const claim = await dieAfterClaim(ids.a);
      expect(claim.attempts).toBe(2);

      const result = await sweepExpiredLeases({ workflowId });
      expect(result.reclaimed).toBe(1);
      const a = await task(ids.a);
      expect(a.status).toBe("READY");
      expect(a.attempts).toBe(2);
      expect(a.leaseOwner).toBeNull();
      expect(a.leaseExpiresAt).toBeNull();
      expect(calls).toBe(0);
    });

    it("[AC1] the execute-route sweep is scoped to the owner: another user's poll gets 404 and reclaims nothing", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slug, attempts: 0 },
      ]);
      const claim = await dieAfterClaim(ids.a);

      const res = await execute(workflowId, OTHER_USER_ID);
      expect(res.status).toBe(404);
      const a = await task(ids.a);
      expect(a.status).toBe("RUNNING");
      expect(a.leaseOwner).toBe(claim.leaseOwner);
    });
  });

  describe("[AC1b] over-reclaim controls", () => {
    it("[AC1b] a live lease with a stale lastActivityAt is untouched", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      const claim = await claimTask(ids.a, TIMEOUT_MS);
      await prisma.agentWorkflow.update({
        where: { id: workflowId },
        data: { lastActivityAt: new Date(Date.now() - 60 * MIN) },
      });

      const result = await sweepExpiredLeases({ workflowId });
      expect(result).toMatchObject({ reclaimed: 0, deadLettered: 0, legacyUnleased: 0, cancelled: 0 });
      const a = await task(ids.a);
      expect(a.status).toBe("RUNNING");
      expect(a.leaseOwner).toBe(claim!.leaseOwner);
    });

    it("[AC1b] a legacy unleased RUNNING row at 14 minutes is untouched", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      await setLegacyStartedAgo(ids.a, 14 * MIN);

      await sweepExpiredLeases({ workflowId });
      const a = await task(ids.a);
      expect(a.status).toBe("RUNNING");
      expect(a.errorCode).toBeNull();
    });

    it("[AC1b] a legacy unleased RUNNING row at 16 minutes goes to DEAD_LETTER LEGACY_UNLEASED, never READY", async () => {
      const { workflowId, ids } = await makeWorkflow([
        { key: "a", agentSlug: slug, attempts: 0 },
        { key: "b", agentSlug: slug, status: "PENDING", dependsOn: ["a"] },
      ]);
      await setLegacyStartedAgo(ids.a, 16 * MIN);

      const result = await sweepExpiredLeases({ workflowId });
      expect(result.legacyUnleased).toBe(1);
      expect(result.reclaimed).toBe(0);
      const a = await task(ids.a);
      expect(a.status).toBe("DEAD_LETTER");
      expect(a.errorCode).toBe("LEGACY_UNLEASED");
      expect((await task(ids.b)).status).toBe("SKIPPED");
      expect((await logs(ids.a)).some((l) => l.level === "error")).toBe(true);
    });

    it("[AC1b] a legacy RUNNING row with startedAt NULL goes to DEAD_LETTER", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      await setLegacyStartedAgo(ids.a, null);

      await sweepExpiredLeases({ workflowId });
      const a = await task(ids.a);
      expect(a.status).toBe("DEAD_LETTER");
      expect(a.errorCode).toBe("LEGACY_UNLEASED");
    });

    it("[AC1b] an expired task on a CANCELLED workflow goes to CANCELLED and the workflow stays CANCELLED", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      await dieAfterClaim(ids.a);
      await prisma.agentWorkflow.update({
        where: { id: workflowId },
        data: { status: "CANCELLED" },
      });

      const result = await sweepExpiredLeases({ workflowId });
      expect(result.cancelled).toBe(1);
      const a = await task(ids.a);
      expect(a.status).toBe("CANCELLED");
      expect(a.leaseOwner).toBeNull();
      expect((await workflow(workflowId)).status).toBe("CANCELLED");
    });

    it("[AC1b] an expired task on a PAUSED workflow matches neither arm", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      const claim = await dieAfterClaim(ids.a);
      await prisma.agentWorkflow.update({
        where: { id: workflowId },
        data: { status: "PAUSED" },
      });

      await sweepExpiredLeases({ workflowId });
      const a = await task(ids.a);
      expect(a.status).toBe("RUNNING");
      expect(a.leaseOwner).toBe(claim.leaseOwner);
    });
  });

  describe("[AC2c] lease margin", () => {
    it("[AC2c] the claim's lease is timeoutMs + 2 x pool connection timeout + 10 s, on the database clock", async () => {
      expect(LEASE_MARGIN_MS).toBe(2 * PG_POOL_CONNECTION_TIMEOUT_MS + 10_000);
      const { ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      await claimTask(ids.a, TIMEOUT_MS);
      const a = await task(ids.a);
      expect(a.leaseExpiresAt!.getTime() - a.startedAt!.getTime()).toBe(
        TIMEOUT_MS + LEASE_MARGIN_MS,
      );
    });

    it("[AC2c] a delay of timeoutMs + 30 s after the claim causes no reclaim", async () => {
      const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slug }]);
      const claim = await claimTask(ids.a, TIMEOUT_MS);
      await ageLease(ids.a, TIMEOUT_MS + 30_000);

      const result = await sweepExpiredLeases({ workflowId });
      expect(result.reclaimed + result.deadLettered).toBe(0);
      const a = await task(ids.a);
      expect(a.status).toBe("RUNNING");
      expect(a.leaseOwner).toBe(claim!.leaseOwner);
    });
  });
});
