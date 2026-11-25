/**
 * RA-8446 — /api/cron/sync-invoices picks rows through the readiness owner.
 *
 * Before RA-8446 the cron picked every status === CONNECTED row, so a row with
 * no organisation (no tenantId / realmId) was queued, and a SYNCING / ERROR row
 * the owner calls ready was never swept. getOAuthReadiness now decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindMany = vi.fn();
const integrationUpdate = vi.fn();
const invoiceFindMany = vi.fn();
const queueInvoiceSync = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: (...a: unknown[]) => integrationFindMany(...a),
      update: (...a: unknown[]) => integrationUpdate(...a),
    },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    cronJobRun: {
      findFirst: async () => null,
      create: async () => ({ id: "run_1" }),
      update: async () => ({}),
    },
    $executeRaw: async () => 0,
    $transaction(claim: (tx: unknown) => unknown) {
      return claim(this);
    },
  },
}));
vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: (...a: unknown[]) => queueInvoiceSync(...a),
}));
vi.mock("@/lib/integrations/zoho/queue", () => ({
  processZohoSyncBatch: async () => ({ processed: 0, failed: 0 }),
}));

import { GET } from "../route";

const SECRET = "test-cron-secret";

function authorised() {
  return new NextRequest("http://localhost/api/cron/sync-invoices", {
    method: "GET",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

const base = { userId: "user-1", workspaceId: null, lastSyncAt: null, icon: null, config: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  integrationFindMany.mockResolvedValue([]);
  integrationUpdate.mockResolvedValue({});
  invoiceFindMany.mockResolvedValue([{ id: "inv-1", invoiceNumber: "INV-1", status: "SENT" }]);
  queueInvoiceSync.mockResolvedValue(undefined);
});

describe("GET /api/cron/sync-invoices — readiness owner picks the rows", () => {
  it("asks SQL only for rows the owner could call ready, with credentials present", async () => {
    await GET(authorised());
    expect(integrationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["CONNECTED", "SYNCING", "ERROR"] },
        accessToken: { not: null, notIn: [""] },
      }),
      select: expect.objectContaining({ status: true, tenantId: true, realmId: true }),
    }));
  });

  it("skips a CONNECTED row with no organisation", async () => {
    integrationFindMany.mockResolvedValue([
      { ...base, id: "xero-no-org", provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: null },
      { ...base, id: "qbo-no-realm", provider: "QUICKBOOKS", name: "QuickBooks", status: "CONNECTED", realmId: null },
    ]);
    await GET(authorised());
    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(queueInvoiceSync).not.toHaveBeenCalled();
  });

  it("syncs a SYNCING row the owner calls ready", async () => {
    integrationFindMany.mockResolvedValue([
      { ...base, id: "xero-busy", provider: "XERO", name: "Xero", status: "SYNCING", tenantId: "org-1" },
    ]);
    await GET(authorised());
    expect(queueInvoiceSync).toHaveBeenCalledExactlyOnceWith("inv-1", "XERO", "NORMAL");
    expect(integrationUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "xero-busy" } }));
  });

  it("does not sync a DISCONNECTED row even if SQL returned it", async () => {
    integrationFindMany.mockResolvedValue([
      { ...base, id: "gone", provider: "XERO", name: "Xero", status: "DISCONNECTED", tenantId: "org-1" },
    ]);
    await GET(authorised());
    expect(queueInvoiceSync).not.toHaveBeenCalled();
  });
});
