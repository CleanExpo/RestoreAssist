/**
 * Punch-list P1 #11.2 — cron route auth + dispatch for mirror-recovery sweep.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sweepDeadLettersMock } = vi.hoisted(() => ({
  sweepDeadLettersMock: vi.fn(),
}));

vi.mock("@/lib/lifecycle/subscribers/mirror-recovery", () => ({
  sweepDeadLetters: sweepDeadLettersMock,
}));

import { GET } from "@/app/api/cron/storage-mirror-recovery/route";

beforeEach(() => {
  vi.clearAllMocks();
  sweepDeadLettersMock.mockResolvedValue({ deadLettered: 2, notified: 3 });
  process.env.CRON_SECRET = "test-secret";
});

function buildRequest(authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/storage-mirror-recovery", {
    headers,
  });
}

describe("GET /api/cron/storage-mirror-recovery", () => {
  it("rejects requests without the bearer secret", async () => {
    const res = await GET(buildRequest(null));
    expect(res.status).toBe(401);
    expect(sweepDeadLettersMock).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong bearer", async () => {
    const res = await GET(buildRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(sweepDeadLettersMock).not.toHaveBeenCalled();
  });

  it("dispatches sweepDeadLetters and returns the stats shape on success", async () => {
    const res = await GET(buildRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(sweepDeadLettersMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.deadLettered).toBe(2);
    expect(body.notified).toBe(3);
  });
});
