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

// RA-8425: the poll took the 50 oldest outstanding invoices by updatedAt and
// only wrote to an invoice when it was paid, so an unpaid, voided or deleted
// invoice kept its place and invoice 51 was never polled. The fakes below keep
// state between runs: invoices honour where/orderBy/take, and each completed
// run's metadata is read back by the next run, as the real tables do.
describe("GET /api/cron/sync-xero-payments — rotation through the outstanding set", () => {
  type StoredInvoice = { id: string; externalInvoiceId: string; status: string; updatedAt: number };
  type IdFilter = { gt?: string; lte?: string; notIn?: string[] };
  type FindArgs = {
    where: { status?: { in: string[] }; id?: IdFilter };
    orderBy?: Record<string, "asc" | "desc">;
    take?: number;
  };

  let invoices: StoredInvoice[];
  let runs: { id: string; jobName: string; status: string; startedAt: number; metadata: string | null }[];

  function matchesId(id: string, filter: IdFilter | undefined) {
    if (!filter) return true;
    if (filter.gt !== undefined && !(id > filter.gt)) return false;
    if (filter.lte !== undefined && !(id <= filter.lte)) return false;
    if (filter.notIn && filter.notIn.includes(id)) return false;
    return true;
  }

  function seedInvoices(count: number) {
    invoices = Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(3, "0");
      // Invoice 1 has the oldest updatedAt, invoice `count` the newest.
      return { id: `inv-${n}`, externalInvoiceId: `xero-${n}`, status: "SENT", updatedAt: i };
    });
  }

  beforeEach(() => {
    runs = [];
    invoiceFindMany.mockImplementation(async (args: FindArgs) => {
      const [[key, dir]] = Object.entries(args.orderBy ?? { id: "asc" });
      return invoices
        .filter((inv) => !args.where.status || args.where.status.in.includes(inv.status))
        .filter((inv) => matchesId(inv.id, args.where.id))
        .sort((a, b) => {
          const av = a[key as keyof StoredInvoice];
          const bv = b[key as keyof StoredInvoice];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        })
        .slice(0, args.take ?? Infinity)
        .map(({ id, externalInvoiceId }) => ({ id, externalInvoiceId }));
    });
    invoiceUpdate.mockImplementation(async (args: { where: { id: string }; data: { status: string } }) => {
      const inv = invoices.find((i) => i.id === args.where.id);
      if (inv) {
        inv.status = args.data.status;
        inv.updatedAt = 1_000_000 + runs.length;
      }
      return inv;
    });
    cronJobRunCreate.mockImplementation(async ({ data }: { data: { jobName: string; status: string } }) => {
      const run = { id: `run-${runs.length + 1}`, ...data, startedAt: runs.length, metadata: null };
      runs.push(run);
      return run;
    });
    cronJobRunUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { status: string; metadata?: string | null } }) => {
      const run = runs.find((r) => r.id === where.id);
      if (run) Object.assign(run, data);
      return run;
    });
    cronJobRunFindFirst.mockImplementation(async ({ where }: { where: { jobName: string; status: string } }) => {
      // The overlap guard asks for a running row; every earlier run has finished.
      const matches = runs.filter((r) => r.jobName === where.jobName && r.status === where.status);
      return matches.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    });
  });

  function polledIds() {
    const fetchMock = fetch as unknown as { mock: { calls: [string][] } };
    return fetchMock.mock.calls.map(([url]) => String(url).split("/").pop());
  }

  it("reaches invoice 51 within two runs when the 50 older invoices stay unpaid", async () => {
    seedInvoices(51);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const paid = url.endsWith("/xero-051");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Invoices: [paid
              ? { Status: "PAID", AmountPaid: 300, AmountDue: 0 }
              : { Status: "AUTHORISED", AmountPaid: 0, AmountDue: 500 }],
          }),
        };
      }),
    );

    await GET(authorisedRequest());
    await GET(authorisedRequest());

    expect(polledIds()).toContain("xero-051");
    expect(invoices.find((i) => i.id === "inv-051")?.status).toBe("PAID");

    // A third run keeps rotating instead of returning to the same 50 rows.
    await GET(authorisedRequest());
    const thirdRun = polledIds().slice(-50);
    expect(new Set(thirdRun).size).toBe(thirdRun.length);
    expect(invoices.filter((i) => i.status === "SENT")).toHaveLength(50);
  });

  it("counts voided, deleted and missing invoices under their own counters and never marks a void with nothing due as paid", async () => {
    seedInvoices(3);
    const responses: Record<string, unknown> = {
      "xero-001": { ok: true, status: 200, json: async () => ({ Invoices: [{ Status: "VOIDED", AmountPaid: 0, AmountDue: 0 }] }) },
      "xero-002": { ok: true, status: 200, json: async () => ({ Invoices: [{ Status: "DELETED", AmountPaid: 0, AmountDue: 0 }] }) },
      "xero-003": { ok: false, status: 404, json: async () => ({}) },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => responses[String(url).split("/").pop()!]));

    const response = await GET(authorisedRequest());
    const body = await response.json();

    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(body.metadata).toEqual(expect.objectContaining({
      invoicesPolled: 3,
      invoicesMarkedPaid: 0,
      invoicesVoidedOrDeletedInXero: 2,
      invoicesNotFoundInXero: 1,
      invoiceErrors: 0,
    }));
  });
});
