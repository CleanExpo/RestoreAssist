/**
 * RA-8423: the metrics endpoint must scope every queue count to the
 * signed-in user. Runs the real route with its data sources mocked and
 * checks what each stats helper was asked for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const getQueueStats = vi.hoisted(() => vi.fn());
const getSyncQueueStats = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/jobs/webhook-queue", () => ({ getQueueStats }));
vi.mock("@/lib/integrations/sync-queue", () => ({ getSyncQueueStats }));
vi.mock("@/lib/integrations/circuit-breaker", () => ({
  circuitBreakerManager: { getAllStats: () => ({}) },
}));
vi.mock("@/lib/integrations/rate-limiter", () => ({
  rateLimiterManager: { getAllStats: () => ({}) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findMany: vi.fn().mockResolvedValue([]) },
    integrationSyncLog: { findMany: vi.fn().mockResolvedValue([]) },
    invoicePayment: { count: vi.fn().mockResolvedValue(0) },
    webhookEvent: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import { GET } from "../route";

const QUEUE = { pending: 1, processing: 0, completed: 4, failed: 0, total: 5 };

beforeEach(() => {
  getServerSession.mockReset();
  getQueueStats.mockReset();
  getSyncQueueStats.mockReset();
  getQueueStats.mockResolvedValue(QUEUE);
  getSyncQueueStats.mockResolvedValue(QUEUE);
});

describe("GET /api/integrations/metrics", () => {
  it("asks for the signed-in user's webhook and sync-queue counts only", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-a" } });

    const res = await GET(
      new NextRequest("http://localhost/api/integrations/metrics"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getQueueStats).toHaveBeenCalledTimes(1);
    expect(getQueueStats).toHaveBeenCalledWith({ userId: "user-a" });
    expect(getSyncQueueStats).toHaveBeenCalledTimes(1);
    expect(getSyncQueueStats).toHaveBeenCalledWith("user-a");
    expect(body.webhooks).toMatchObject(QUEUE);
    expect(body.syncQueue).toEqual(QUEUE);
  });

  it("counts nothing for a request with no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/integrations/metrics"),
    );

    expect(res.status).toBe(401);
    expect(getQueueStats).not.toHaveBeenCalled();
    expect(getSyncQueueStats).not.toHaveBeenCalled();
  });
});
