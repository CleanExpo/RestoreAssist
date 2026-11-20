/**
 * RA-8423: GET /api/integrations/metrics showed every signed-in user the
 * site-wide WebhookEvent counts, because getQueueStats() took no scope.
 * The scope is now a required argument: one user's integrations, or every
 * tenant for the CRON_SECRET-gated operator route only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookEventCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { webhookEvent: { count: webhookEventCount } },
}));
vi.mock("@/lib/integrations/webhook-processor", () => ({
  processPendingWebhookEvents: vi.fn(),
  processWebhookEvent: vi.fn(),
}));

import { getQueueStats, type QueueStatsScope } from "../webhook-queue";

beforeEach(() => {
  webhookEventCount.mockReset();
  webhookEventCount.mockResolvedValue(2);
});

describe("getQueueStats scope", () => {
  it("counts only the named user's integrations, in every count", async () => {
    const stats = await getQueueStats({ userId: "user-a" });

    expect(stats).toEqual({
      pending: 2,
      processing: 2,
      completed: 2,
      failed: 2,
      total: 2,
    });
    expect(webhookEventCount).toHaveBeenCalledTimes(5);
    for (const [args] of webhookEventCount.mock.calls) {
      expect(args?.where?.integration).toEqual({ userId: "user-a" });
    }
  });

  it("counts every tenant only when asked for all tenants", async () => {
    await getQueueStats({ allTenants: true });

    expect(webhookEventCount).toHaveBeenCalledTimes(5);
    for (const [args] of webhookEventCount.mock.calls) {
      expect(args?.where?.integration).toBeUndefined();
    }
  });

  it.each([
    ["an undefined userId", { userId: undefined }],
    ["an empty userId", { userId: "" }],
    ["no scope at all", undefined],
    ["an empty object", {}],
    ["allTenants false", { allTenants: false }],
  ])("refuses %s instead of counting every tenant", async (_label, scope) => {
    await expect(
      getQueueStats(scope as unknown as QueueStatsScope),
    ).rejects.toThrow();
    expect(webhookEventCount).not.toHaveBeenCalled();
  });
});
