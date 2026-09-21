/**
 * RA-7597 — /api/cron/trial-reminders auth + dry-run isolation.
 *
 * Dry-run must query without writing CronJobRun, otherwise cron-watchdog
 * would treat a proof-of-read as a successful send.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendTrialReminders = vi.fn();
const runCronJob = vi.fn();
const verifyCronAuth = vi.fn();

vi.mock("@/lib/cron/trial-reminders", () => ({
  sendTrialReminders: (...args: unknown[]) => sendTrialReminders(...args),
}));
vi.mock("@/lib/cron", () => ({
  verifyCronAuth: (...args: unknown[]) => verifyCronAuth(...args),
  runCronJob: (...args: unknown[]) => runCronJob(...args),
}));

import { GET } from "../route";

const SECRET = "test-cron-secret";

function requestWithAuth(path = "/api/cron/trial-reminders", bearer = `Bearer ${SECRET}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: bearer },
  });
}

beforeEach(() => {
  sendTrialReminders.mockReset();
  runCronJob.mockReset();
  verifyCronAuth.mockReset();
  verifyCronAuth.mockReturnValue(null);
  sendTrialReminders.mockResolvedValue({
    itemsProcessed: 0,
    metadata: { dryRun: true, windows: { "3-day": 2, "1-day": 1 } },
  });
  runCronJob.mockResolvedValue({
    itemsProcessed: 1,
    status: "completed",
    metadata: { windows: { "3-day": 1, "1-day": 0 } },
  });
});

describe("GET /api/cron/trial-reminders", () => {
  it("fails closed when verifyCronAuth returns a response", async () => {
    verifyCronAuth.mockReturnValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const response = await GET(requestWithAuth());

    expect(response.status).toBe(401);
    expect(sendTrialReminders).not.toHaveBeenCalled();
    expect(runCronJob).not.toHaveBeenCalled();
  });

  it("runs the live job through runCronJob", async () => {
    const response = await GET(requestWithAuth());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runCronJob).toHaveBeenCalledTimes(1);
    expect(runCronJob.mock.calls[0][0]).toBe("trial-reminders");
    expect(sendTrialReminders).not.toHaveBeenCalled();
    expect(body.status).toBe("completed");
  });

  it("dry-run calls sendTrialReminders({ dryRun: true }) and skips runCronJob", async () => {
    const response = await GET(
      requestWithAuth("/api/cron/trial-reminders?dryRun=1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sendTrialReminders).toHaveBeenCalledWith({ dryRun: true });
    expect(runCronJob).not.toHaveBeenCalled();
    expect(body.status).toBe("dry-run");
    expect(body.metadata.dryRun).toBe(true);
  });

  it("does not invoke welcome or founder-alert handlers", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "app/api/cron/trial-reminders/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/sendWelcome|founder-signup|founderSignup/i);
  });
});
