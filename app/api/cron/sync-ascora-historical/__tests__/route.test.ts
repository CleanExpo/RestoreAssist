/**
 * RA-275 — /api/cron/sync-ascora-historical
 *
 * The historical Ascora importer (POST /api/ascora/sync) already supports a
 * CRON_SECRET bearer path but had no scheduled trigger — no vercel.json
 * entry, and the dashboard "Sync" button drives a different, generic
 * pipeline. This cron route is the missing trigger: verifyCronAuth →
 * runCronJob → re-invoke the importer's own POST handler in-process with
 * ?incremental=true, forwarding the same (already-verified) bearer header.
 *
 * Mirrors sync-qbo-myob-payments' test posture: auth gate, then delegate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const syncAscoraHistoricalMock = vi.fn();
const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/app/api/ascora/sync/route", () => ({
  POST: (...a: unknown[]) => syncAscoraHistoricalMock(...a),
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
  return new NextRequest(
    "http://localhost/api/cron/sync-ascora-historical",
    { method: "GET", headers },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;

  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
});

describe("GET /api/cron/sync-ascora-historical", () => {
  it("rejects a request with no Authorization header, without invoking the importer", async () => {
    const response = await GET(requestWithAuth());

    expect(response.status).toBe(401);
    expect(syncAscoraHistoricalMock).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    const response = await GET(requestWithAuth("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(syncAscoraHistoricalMock).not.toHaveBeenCalled();
  });

  it("re-invokes the historical importer incrementally, forwarding the verified bearer token", async () => {
    syncAscoraHistoricalMock.mockResolvedValue(
      NextResponse.json({
        success: true,
        jobsImported: 7,
        historicalJobsUpserted: 7,
        message: "Imported 7 jobs",
      }),
    );

    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(syncAscoraHistoricalMock).toHaveBeenCalledTimes(1);

    const innerRequest = syncAscoraHistoricalMock.mock.calls[0][0] as NextRequest;
    expect(innerRequest.method).toBe("POST");
    expect(innerRequest.url).toContain("/api/ascora/sync");
    expect(innerRequest.url).toContain("incremental=true");
    expect(innerRequest.headers.get("authorization")).toBe(`Bearer ${SECRET}`);

    expect(body.success).toBe(true);
    expect(body.itemsProcessed).toBe(7);
    expect(body.metadata.jobsImported).toBe(7);
  });

  it("surfaces (rejects) a failed historical sync so it lands as a failed CronJobRun", async () => {
    syncAscoraHistoricalMock.mockResolvedValue(
      NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ascora not connected" } },
        { status: 404 },
      ),
    );

    await expect(GET(requestWithAuth(`Bearer ${SECRET}`))).rejects.toThrow(
      /sync-ascora-historical/,
    );
  });

  it("does not run a second overlapping invocation while one is already in flight", async () => {
    cronJobRunFindFirst.mockResolvedValue({ id: "already_running" });

    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("skipped");
    expect(syncAscoraHistoricalMock).not.toHaveBeenCalled();
  });
});
