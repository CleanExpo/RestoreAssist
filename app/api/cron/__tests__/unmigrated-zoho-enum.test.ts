/**
 * RA-8215 — production cron HTTP 500 on sync-xero-payments and sync-invoices.
 *
 * #2499 added ZOHO to OAUTH_PROVIDERS and shipped migration
 * 20261105050000_ra8199_zoho_crm, which adds ZOHO to the IntegrationProvider
 * enum. Production deploys code on push but migrates only as a separately
 * approved step, so the live enum has no ZOHO. Postgres rejects any query
 * that names an unknown enum value (P2007), so every integration lookup that
 * spread OAUTH_CANDIDATE_WHERE failed, even when it only wanted XERO.
 *
 * The fake database below behaves like production: it refuses any
 * integration query that mentions ZOHO, and has no ZohoSyncJob table.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindMany = vi.fn();
const integrationUpdate = vi.fn();
const invoiceFindMany = vi.fn();
const zohoSyncJobFindMany = vi.fn();
const cronJobRunUpdate = vi.fn();

function unmigratedEnumGuard(args: unknown) {
  if (JSON.stringify(args).includes('"ZOHO"')) {
    throw Object.assign(
      new Error('invalid input value for enum "IntegrationProvider": "ZOHO"'),
      { code: "P2007" },
    );
  }
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: async (args: unknown) => {
        unmigratedEnumGuard(args);
        return integrationFindMany(args);
      },
      update: (...a: unknown[]) => integrationUpdate(...a),
    },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    zohoSyncJob: {
      findMany: async (args: unknown) => {
        zohoSyncJobFindMany(args);
        throw Object.assign(new Error('relation "ZohoSyncJob" does not exist'), { code: "P2021" });
      },
    },
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
vi.mock("@/lib/integrations/xero/webhook-processor", () => ({
  processXeroWebhookBatch: async () => ({ processed: 0, failed: 0, skipped: 0 }),
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: async () => ({ ok: true, data: "xero-token" }),
}));
vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: async () => undefined,
}));

const SECRET = "test-cron-secret";

function authorised(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_ZOHO_ENABLED", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network denied"); }));
  integrationFindMany.mockResolvedValue([]);
  invoiceFindMany.mockResolvedValue([]);
  cronJobRunUpdate.mockResolvedValue({});
});

describe("cron routes against a database that has not applied the Zoho migration", () => {
  it("sync-xero-payments returns 200 and completes", async () => {
    const { GET } = await import("../sync-xero-payments/route");
    const res = await GET(authorised("/api/cron/sync-xero-payments"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, status: "completed" });
    expect(integrationFindMany).toHaveBeenCalledTimes(1);
  });

  it("sync-invoices returns 200 and completes, containing the missing Zoho queue table", async () => {
    const { GET } = await import("../sync-invoices/route");
    const res = await GET(authorised("/api/cron/sync-invoices"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      status: "completed",
      metadata: { zohoProcessed: 0, zohoFailed: 0 },
    });
    expect(integrationFindMany).toHaveBeenCalledTimes(1);
    // The drain is attempted and its P2021 is contained by drainZoho.
    expect(zohoSyncJobFindMany).toHaveBeenCalledTimes(1);
  });

  it("positive control: with Zoho switched on, the same fake database refuses the query", async () => {
    vi.stubEnv("NEXT_PUBLIC_ZOHO_ENABLED", "true");
    const { GET } = await import("../sync-xero-payments/route");
    await expect(GET(authorised("/api/cron/sync-xero-payments"))).rejects.toThrow(
      'Cron job "sync-xero-payments" failed',
    );
    expect(cronJobRunUpdate.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining('"ZOHO"'),
    });
  });
});
