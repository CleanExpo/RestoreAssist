/**
 * SP-T Block 7 — storage-restore cron route auth + dispatch.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { processNextRestoreBatchMock } = vi.hoisted(() => ({
  processNextRestoreBatchMock: vi.fn(),
}));

vi.mock("@/lib/queue/storage-restore", () => ({
  processNextRestoreBatch: processNextRestoreBatchMock,
}));

import { GET } from "@/app/api/cron/storage-restore/route";

beforeEach(() => {
  vi.clearAllMocks();
  processNextRestoreBatchMock.mockResolvedValue({
    processed: 2,
    failed: 0,
    skipped: 1,
    remaining: 0,
  });
  process.env.CRON_SECRET = "test-secret";
});

function buildRequest(authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/storage-restore", {
    headers,
  });
}

describe("GET /api/cron/storage-restore", () => {
  it("rejects requests without the bearer secret", async () => {
    const res = await GET(buildRequest(null));
    expect(res.status).toBe(401);
    expect(processNextRestoreBatchMock).not.toHaveBeenCalled();
  });

  it("dispatches processNextRestoreBatch and returns the stats shape on success", async () => {
    const res = await GET(buildRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(processNextRestoreBatchMock).toHaveBeenCalledWith({ maxJobs: 50 });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.remaining).toBe(0);
  });
});
