/**
 * RA-8446 — POST /api/invoices/[id]/sync takes readiness from the owner.
 *
 * selectOAuthIntegration({ requireReady: true }) asks getOAuthReadiness. The
 * route used to re-check status === CONNECTED and a lapsed tokenExpiresAt after
 * that, so it refused a SYNCING row the owner calls ready and a row whose
 * access token the provider sync would refresh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindMany = vi.fn();
const integrationFindFirst = vi.fn();
const integrationUpdate = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceUpdate = vi.fn();
const syncInvoiceToXero = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (req: NextRequest, _id: unknown, fn: (raw: string) => unknown) => req.text().then(fn),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: (...a: unknown[]) => integrationFindMany(...a),
      findFirst: (...a: unknown[]) => integrationFindFirst(...a),
      update: (...a: unknown[]) => integrationUpdate(...a),
    },
    invoice: {
      findUnique: (...a: unknown[]) => invoiceFindUnique(...a),
      update: (...a: unknown[]) => invoiceUpdate(...a),
    },
    invoiceAuditLog: { create: async () => ({}) },
    integrationSyncLog: { create: async () => ({}) },
  },
}));
vi.mock("@/lib/integrations/xero", () => ({ syncInvoiceToXero: (...a: unknown[]) => syncInvoiceToXero(...a) }));
vi.mock("@/lib/integrations/quickbooks", () => ({ syncInvoiceToQuickBooks: vi.fn() }));
vi.mock("@/lib/integrations/myob", () => ({ syncInvoiceToMYOB: vi.fn() }));

import { POST } from "../route";

function request() {
  return new NextRequest("http://localhost/api/invoices/inv-1/sync", {
    method: "POST",
    body: JSON.stringify({ provider: "xero" }),
  });
}
const params = { params: Promise.resolve({ id: "inv-1" }) };
const xero = { id: "xero-1", userId: "owner", workspaceId: null, provider: "XERO", name: "Xero", icon: null, config: null, realmId: null, companyId: null };

beforeEach(() => {
  vi.clearAllMocks();
  invoiceFindUnique.mockResolvedValue({ id: "inv-1", status: "SENT", currency: "AUD", workspaceId: null, lineItems: [] });
  invoiceUpdate.mockResolvedValue({});
  integrationUpdate.mockResolvedValue({});
  integrationFindFirst.mockResolvedValue({ id: "xero-1" });
  syncInvoiceToXero.mockResolvedValue({ invoiceId: "xero-inv-1" });
});

describe("POST /api/invoices/[id]/sync — readiness owner decides", () => {
  it("syncs a ready row whose access token has lapsed (the provider sync refreshes it)", async () => {
    integrationFindMany.mockResolvedValue([{ ...xero, status: "CONNECTED", tenantId: "org", tokenExpiresAt: new Date("2020-01-01") }]);
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(syncInvoiceToXero).toHaveBeenCalledOnce();
  });

  it("syncs a SYNCING row the owner calls ready", async () => {
    integrationFindMany.mockResolvedValue([{ ...xero, status: "SYNCING", tenantId: "org", tokenExpiresAt: null }]);
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(syncInvoiceToXero).toHaveBeenCalledOnce();
  });

  it("refuses a CONNECTED row with no organisation as not connected", async () => {
    integrationFindMany.mockResolvedValue([{ ...xero, status: "CONNECTED", tenantId: null, tokenExpiresAt: new Date("2099-01-01") }]);
    const res = await POST(request(), params);
    expect(res.status).toBe(400);
    expect(syncInvoiceToXero).not.toHaveBeenCalled();
  });

  it("returns 404 when there is no Xero connection at all", async () => {
    integrationFindMany.mockResolvedValue([]);
    const res = await POST(request(), params);
    expect(res.status).toBe(404);
    expect(syncInvoiceToXero).not.toHaveBeenCalled();
  });
});
