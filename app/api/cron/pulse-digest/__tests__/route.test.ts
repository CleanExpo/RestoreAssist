/**
 * RA-6951 — /api/cron/pulse-digest auth + wiring.
 *
 * Covers:
 *   - Fails closed with no Authorization header.
 *   - Fails closed with the wrong bearer token.
 *   - Calls runPulseDigest via runCronJob on an authorised request.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runPulseDigest = vi.fn();
const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/lib/cron/pulse-digest", () => ({
  runPulseDigest: (...args: unknown[]) => runPulseDigest(...args),
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
  return new NextRequest("http://localhost/api/cron/pulse-digest", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  runPulseDigest.mockReset();
  cronJobRunFindFirst.mockReset();
  cronJobRunCreate.mockReset();
  cronJobRunUpdate.mockReset();
  delete process.env.CRON_SECRET;

  runPulseDigest.mockResolvedValue({
    itemsProcessed: 3,
    metadata: { digestsSent: 2, copUpdatesSent: 1, jobsConsidered: 3 },
  });
  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
});

describe("GET /api/cron/pulse-digest", () => {
  it("fails closed when CRON_SECRET is unset", async () => {
    const response = await GET(requestWithAuth(`Bearer anything`));

    expect(response.status).toBe(401);
    expect(runPulseDigest).not.toHaveBeenCalled();
  });

  it("rejects a request with no Authorization header", async () => {
    process.env.CRON_SECRET = SECRET;
    const response = await GET(requestWithAuth());

    expect(response.status).toBe(401);
    expect(runPulseDigest).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    process.env.CRON_SECRET = SECRET;
    const response = await GET(requestWithAuth("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(runPulseDigest).not.toHaveBeenCalled();
  });

  it("calls runPulseDigest on an authorised request", async () => {
    process.env.CRON_SECRET = SECRET;
    const response = await GET(requestWithAuth(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runPulseDigest).toHaveBeenCalledTimes(1);
    expect(body.itemsProcessed).toBe(3);
    expect(body.status).toBe("completed");
  });
});
