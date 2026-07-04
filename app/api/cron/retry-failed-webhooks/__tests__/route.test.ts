/**
 * RA-6974 item 2 — /api/cron/retry-failed-webhooks wiring.
 *
 * retryFailedEvents had zero callers, so a FAILED webhook event (e.g. a
 * Xero event marked FAILED by processXeroWebhookBatch on first error) was
 * never retried. This cron mirrors the repo's existing cron pattern
 * (verifyCronAuth + runCronJob, see /api/cron/prune-webhook-events) to
 * drain FAILED events back to PENDING on a schedule.
 *
 * Covers:
 *   - Rejects requests without a valid CRON_SECRET bearer token.
 *   - Calls retryFailedEvents via runCronJob on an authorised request.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retryFailedEvents = vi.fn();
const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/lib/jobs/webhook-queue", () => ({
  retryFailedEvents: (...args: unknown[]) => retryFailedEvents(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobRun: {
      findFirst: (...a: unknown[]) => cronJobRunFindFirst(...a),
      create: (...a: unknown[]) => cronJobRunCreate(...a),
      update: (...a: unknown[]) => cronJobRunUpdate(...a),
    },
  },
}));

import { GET } from "../route";

const SECRET = "test-cron-secret";

function requestWithAuth(bearer?: string) {
  const headers: Record<string, string> = {};
  if (bearer !== undefined) headers["authorization"] = bearer;
  return new NextRequest("http://localhost/api/cron/retry-failed-webhooks", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  retryFailedEvents.mockReset();
  cronJobRunFindFirst.mockReset();
  cronJobRunCreate.mockReset();
  cronJobRunUpdate.mockReset();
  process.env.CRON_SECRET = SECRET;

  retryFailedEvents.mockResolvedValue(2);
  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
});

describe("GET /api/cron/retry-failed-webhooks", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(requestWithAuth());

    expect(response.status).toBe(401);
    expect(retryFailedEvents).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    const response = await GET(requestWithAuth("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(retryFailedEvents).not.toHaveBeenCalled();
  });

  it("calls retryFailedEvents on an authorised request", async () => {
    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(retryFailedEvents).toHaveBeenCalledTimes(1);
    expect(body.itemsProcessed).toBe(2);
    expect(body.status).toBe("completed");
  });
});
