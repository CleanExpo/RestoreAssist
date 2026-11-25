/**
 * RA-8481 — a stale-claim reclaim that cannot run fails the cron run.
 *
 * sync-xero-payments and sync-qbo-myob-payments treat a drain error as
 * non-fatal: they log it and carry on, and runCronJob records "completed".
 * The reclaim runs inside those drains, so before this fix a reclaim that
 * hit a database error looked like a successful run while dead PROCESSING
 * claims piled up and paid invoices stayed unpaid. Now the routes still run
 * their other phases, then rethrow the reclaim error, so runCronJob records
 * the run failed and the route returns a failure (Next.js answers 500).
 *
 * The drains and runCronJob are the real code; the database and the reclaim
 * itself are stand-ins.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const webhookEventFindMany = vi.fn();
const webhookEventUpdateMany = vi.fn();
const integrationFindMany = vi.fn();
const cronJobRunUpdate = vi.fn();
const reclaim = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: (...a: unknown[]) => webhookEventFindMany(...a),
      updateMany: (...a: unknown[]) => webhookEventUpdateMany(...a),
      update: async () => ({}),
    },
    integration: {
      findMany: (...a: unknown[]) => integrationFindMany(...a),
      findUnique: async () => null,
    },
    invoice: { findMany: async () => [] },
    cronJobRun: {
      findFirst: async () => null,
      create: async () => ({ id: "run_1" }),
      update: (...a: unknown[]) => cronJobRunUpdate(...a),
    },
    $executeRaw: async () => 0,
    $transaction(claim: (tx: unknown) => unknown) {
      return claim(this);
    },
  },
}));
vi.mock("@/lib/jobs/webhook-reclaim", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/jobs/webhook-reclaim")>()),
  reclaimStaleWebhookEvents: (...a: unknown[]) => reclaim(...a),
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: async () => ({ ok: true, data: "xero-token" }),
}));
vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: async () => undefined,
}));

import { WebhookReclaimError } from "@/lib/jobs/webhook-reclaim";
import { GET as xeroGET } from "../sync-xero-payments/route";
import { GET as qboMyobGET } from "../sync-qbo-myob-payments/route";

const SECRET = "test-cron-secret";

function authorised(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

function recordedRun() {
  return cronJobRunUpdate.mock.calls.at(-1)?.[0]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_ZOHO_ENABLED", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network denied"); }));
  reclaim.mockResolvedValue({ released: 0, failed: 0 });
  webhookEventFindMany.mockResolvedValue([]);
  webhookEventUpdateMany.mockResolvedValue({ count: 0 });
  integrationFindMany.mockResolvedValue([]);
  cronJobRunUpdate.mockResolvedValue({});
});

function reclaimFails() {
  reclaim.mockRejectedValue(
    new WebhookReclaimError(new Error("connection terminated unexpectedly")),
  );
}

describe("sync-xero-payments", () => {
  it("fails the run when the reclaim fails, after still running the polling phase", async () => {
    reclaimFails();
    await expect(xeroGET(authorised("/api/cron/sync-xero-payments"))).rejects.toThrow(
      'Cron job "sync-xero-payments" failed',
    );
    expect(recordedRun()).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("reclaim failed"),
    });
    expect(integrationFindMany).toHaveBeenCalledTimes(1);
  });

  it("control: a healthy reclaim completes with 200", async () => {
    const res = await xeroGET(authorised("/api/cron/sync-xero-payments"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, status: "completed" });
    expect(reclaim).toHaveBeenCalledTimes(1);
  });

  it("control: any other drain error stays non-fatal", async () => {
    webhookEventFindMany.mockRejectedValue(new Error("drain select failed"));
    const res = await xeroGET(authorised("/api/cron/sync-xero-payments"));
    expect(res.status).toBe(200);
    expect(recordedRun()).toMatchObject({ status: "completed" });
  });
});

describe("sync-qbo-myob-payments", () => {
  it("fails the run when the reclaim fails, after attempting both phases", async () => {
    reclaimFails();
    await expect(
      qboMyobGET(authorised("/api/cron/sync-qbo-myob-payments")),
    ).rejects.toThrow('Cron job "sync-qbo-myob-payments" failed');
    expect(recordedRun()).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("reclaim failed"),
    });
    expect(reclaim).toHaveBeenCalledTimes(2);
  });

  it("fails the run when only the retroactive phase's reclaim fails", async () => {
    reclaim
      .mockResolvedValueOnce({ released: 0, failed: 0 })
      .mockRejectedValueOnce(new WebhookReclaimError(new Error("deadlock detected")));
    await expect(
      qboMyobGET(authorised("/api/cron/sync-qbo-myob-payments")),
    ).rejects.toThrow('Cron job "sync-qbo-myob-payments" failed');
    expect(recordedRun()).toMatchObject({ status: "failed" });
  });

  it("control: a healthy reclaim completes with 200", async () => {
    const res = await qboMyobGET(authorised("/api/cron/sync-qbo-myob-payments"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, status: "completed" });
  });

  it("control: any other drain error stays non-fatal", async () => {
    webhookEventFindMany.mockRejectedValue(new Error("drain select failed"));
    const res = await qboMyobGET(authorised("/api/cron/sync-qbo-myob-payments"));
    expect(res.status).toBe(200);
    expect(recordedRun()).toMatchObject({ status: "completed" });
  });
});

describe("reclaimStaleWebhookEvents", () => {
  it("raises a database error as WebhookReclaimError", async () => {
    const actual = await vi.importActual<typeof import("@/lib/jobs/webhook-reclaim")>(
      "@/lib/jobs/webhook-reclaim",
    );
    webhookEventUpdateMany.mockRejectedValue(new Error("connection terminated"));
    const thrown = await actual.reclaimStaleWebhookEvents().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(actual.WebhookReclaimError);
    expect((thrown as Error).message).toContain("connection terminated");
  });
});
