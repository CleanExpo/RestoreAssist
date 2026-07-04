/**
 * RA-6974 item 2 — retryFailedEvents bounded retry.
 *
 * processXeroWebhookBatch marks a FAILED webhook event on first error with
 * no retry (previously the generic processor retried transient failures up
 * to 5x with backoff). retryFailedEvents resets FAILED -> PENDING so the
 * next processing pass picks it up again, but must not do so forever for a
 * permanently-broken event — bound it the same way the old generic path
 * was bounded (5 attempts), using the existing retryCount column.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookEventUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      updateMany: (...args: unknown[]) => webhookEventUpdateMany(...args),
    },
  },
}));
vi.mock("@/lib/integrations/webhook-processor", () => ({
  processPendingWebhookEvents: vi.fn(),
  processWebhookEvent: vi.fn(),
}));

import { retryFailedEvents } from "../webhook-queue";

beforeEach(() => {
  webhookEventUpdateMany.mockReset();
  webhookEventUpdateMany.mockResolvedValue({ count: 3 });
});

describe("retryFailedEvents", () => {
  it("resets FAILED events to PENDING and increments retryCount atomically", async () => {
    const count = await retryFailedEvents();

    expect(count).toBe(3);
    expect(webhookEventUpdateMany).toHaveBeenCalledTimes(1);
    const call = webhookEventUpdateMany.mock.calls[0][0];
    expect(call.data.status).toBe("PENDING");
    expect(call.data.retryCount).toEqual({ increment: 1 });
  });

  it("excludes events that have already exhausted the retry budget", async () => {
    await retryFailedEvents({ maxRetries: 5 });

    const call = webhookEventUpdateMany.mock.calls[0][0];
    expect(call.where.status).toBe("FAILED");
    expect(call.where.retryCount).toEqual({ lt: 5 });
  });

  it("defaults the retry budget to 5 (matches the old generic processor's cap)", async () => {
    await retryFailedEvents();

    const call = webhookEventUpdateMany.mock.calls[0][0];
    expect(call.where.retryCount).toEqual({ lt: 5 });
  });
});
