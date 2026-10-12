/**
 * RA-7645 — /api/cron/sync-xero-payments fallback poll.
 *
 * When the poll finds an invoice Xero reports as paid, it must copy Xero's own
 * AmountPaid / AmountDue (dollars) onto the invoice (cents). Before RA-7645 it
 * flipped the status to PAID and left amountPaid at 0 and amountDue at the full
 * total, so the invoice said PAID and "$X owing" at the same time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const processXeroWebhookBatch = vi.fn();
const getValidXeroAccessToken = vi.fn();
const integrationFindMany = vi.fn();
const invoiceFindMany = vi.fn();
const invoiceUpdate = vi.fn();
const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/lib/integrations/xero/webhook-processor", () => ({
  processXeroWebhookBatch: (...a: unknown[]) => processXeroWebhookBatch(...a),
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: (...a: unknown[]) => getValidXeroAccessToken(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findMany: (...a: unknown[]) => integrationFindMany(...a) },
    invoice: {
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
      update: (...a: unknown[]) => invoiceUpdate(...a),
    },
    cronJobRun: {
      findFirst: (...a: unknown[]) => cronJobRunFindFirst(...a),
      create: (...a: unknown[]) => cronJobRunCreate(...a),
      update: (...a: unknown[]) => cronJobRunUpdate(...a),
    },
    // RA-7774: runCronJob claims a run in a transaction under an advisory lock.
    $executeRaw: async () => 0,
    $transaction(claim: (tx: unknown) => unknown) {
      return claim(this);
    },
  },
}));

import { GET } from "../route";

const SECRET = "test-cron-secret";

function authorisedRequest() {
  return new NextRequest("http://localhost/api/cron/sync-xero-payments", {
    method: "GET",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

function xeroReturns(invoice: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Invoices: [invoice] }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network denied"); }));
  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
  processXeroWebhookBatch.mockResolvedValue({ processed: 0, failed: 0, skipped: 0 });
  getValidXeroAccessToken.mockResolvedValue({ ok: true, data: "xero-token" });
  integrationFindMany.mockResolvedValue([
    { id: "integ-1", provider: "XERO", name: "Xero", workspaceId: null, tenantId: "tenant-1", userId: "user-1" },
  ]);
  invoiceFindMany.mockResolvedValue([{ id: "inv-1", externalInvoiceId: "xero-inv-1" }]);
  invoiceUpdate.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/cron/sync-xero-payments — polled payment amounts", () => {
  it("copies Xero's AmountPaid and AmountDue onto a paid invoice, in cents", async () => {
    xeroReturns({
      Status: "PAID",
      AmountPaid: 1100.55,
      AmountDue: 0,
      FullyPaidOnDate: "2026-09-01T00:00:00",
    });

    const response = await GET(authorisedRequest());

    expect(response.status).toBe(200);
    expect(invoiceUpdate).toHaveBeenCalledTimes(1);
    expect(invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1", userId: "user-1", workspaceId: null, externalInvoiceId: "xero-inv-1", externalSyncProvider: { in: ["XERO", "xero"] } },
      data: expect.objectContaining({
        status: "PAID",
        amountPaid: 110055,
        amountDue: 0,
      }),
    });
  });

  it("takes Xero's paid figure, not the invoice total, when a credit covered part of it", async () => {
    // $1,000 invoice: $250 credit note applied, $750 paid. AmountDue is 0 so
    // the poll settles it, but only $750 was paid.
    xeroReturns({ Status: "PAID", Total: 1000, AmountPaid: 750, AmountCredited: 250, AmountDue: 0 });

    await GET(authorisedRequest());

    const data = invoiceUpdate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.amountPaid).toBe(75000);
    expect(data.amountDue).toBe(0);
  });

  it("does not touch an invoice Xero still shows as unpaid", async () => {
    xeroReturns({ Status: "AUTHORISED", AmountPaid: 0, AmountDue: 500 });

    await GET(authorisedRequest());

    expect(invoiceUpdate).not.toHaveBeenCalled();
  });
});

it("does not poll a mislabeled AI row or scan another workspace's invoices", async () => {
  integrationFindMany.mockResolvedValue([{ id: "ai", provider: "XERO", name: "OpenAI GPT", icon: "[ra:ai]", tenantId: "tenant", userId: "user-1", workspaceId: null }]);
  await GET(authorisedRequest());
  expect(getValidXeroAccessToken).not.toHaveBeenCalled(); expect(invoiceFindMany).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("uses exact personal workspace scope and does not treat a malformed response as a settled invoice", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: "synthetic malformed" }) }));
  await GET(authorisedRequest());
  expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: null, userId: "user-1", externalSyncProvider: { in: ["XERO", "xero"] } }) }));
  expect(invoiceUpdate).not.toHaveBeenCalled();
});
