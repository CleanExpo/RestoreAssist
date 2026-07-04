/**
 * RA-6984 — /api/cron/sync-qbo-myob-payments
 *
 * Mirrors /api/cron/sync-xero-payments's test posture: auth gate + delegates
 * to the batch functions via runCronJob, returning structured stats (never
 * 5xx — sync failures must never block user-facing operations).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const processQboMyobPendingPayments = vi.fn();
const retryUnresolvedQboMyobPayments = vi.fn();
const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/lib/integrations/webhook-processor", () => ({
  processQboMyobPendingPayments: (...a: unknown[]) =>
    processQboMyobPendingPayments(...a),
  retryUnresolvedQboMyobPayments: (...a: unknown[]) =>
    retryUnresolvedQboMyobPayments(...a),
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
  return new NextRequest("http://localhost/api/cron/sync-qbo-myob-payments", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;

  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
  processQboMyobPendingPayments.mockResolvedValue({
    processed: 2,
    failed: 0,
    skipped: 1,
  });
  retryUnresolvedQboMyobPayments.mockResolvedValue({
    processed: 3,
    failed: 0,
    skipped: 0,
  });
});

describe("GET /api/cron/sync-qbo-myob-payments", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(requestWithAuth());

    expect(response.status).toBe(401);
    expect(processQboMyobPendingPayments).not.toHaveBeenCalled();
    expect(retryUnresolvedQboMyobPayments).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    const response = await GET(requestWithAuth("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(processQboMyobPendingPayments).not.toHaveBeenCalled();
  });

  it("runs both phases on an authorised request and returns combined stats", async () => {
    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processQboMyobPendingPayments).toHaveBeenCalledTimes(1);
    expect(retryUnresolvedQboMyobPayments).toHaveBeenCalledTimes(1);
    expect(body.success).toBe(true);
    // 2 pending processed + 3 retroactive processed = 5
    expect(body.itemsProcessed).toBe(5);
    expect(body.metadata).toEqual(
      expect.objectContaining({
        pendingProcessed: 2,
        pendingFailed: 0,
        pendingSkipped: 1,
        retroactiveProcessed: 3,
        retroactiveFailed: 0,
        retroactiveSkipped: 0,
      }),
    );
  });

  it("still returns 200 with partial stats when the pending-drain phase throws", async () => {
    processQboMyobPendingPayments.mockRejectedValue(new Error("boom"));

    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(retryUnresolvedQboMyobPayments).toHaveBeenCalledTimes(1);
    expect(body.metadata.retroactiveProcessed).toBe(3);
  });
});
