/**
 * SP-E Block 6 — cron route auth + dispatch.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { processNextBatchMock } = vi.hoisted(() => ({
  processNextBatchMock: vi.fn(),
}));

vi.mock("@/lib/queue/storage-mirror", () => ({
  processNextBatch: processNextBatchMock,
}));

import { GET } from "@/app/api/cron/storage-mirror/route";

beforeEach(() => {
  vi.clearAllMocks();
  processNextBatchMock.mockResolvedValue({
    processed: 3,
    failed: 0,
    remaining: 0,
  });
  process.env.CRON_SECRET = "test-secret";
});

function buildRequest(authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/storage-mirror", {
    headers,
  });
}

describe("GET /api/cron/storage-mirror", () => {
  it("rejects requests without the bearer secret", async () => {
    const res = await GET(buildRequest(null));
    expect(res.status).toBe(401);
    expect(processNextBatchMock).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong bearer", async () => {
    const res = await GET(buildRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(processNextBatchMock).not.toHaveBeenCalled();
  });

  it("dispatches processNextBatch and returns the stats shape on success", async () => {
    const res = await GET(buildRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(processNextBatchMock).toHaveBeenCalledWith({ maxJobs: 50 });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(3);
    expect(body.failed).toBe(0);
    expect(body.remaining).toBe(0);
  });
});
