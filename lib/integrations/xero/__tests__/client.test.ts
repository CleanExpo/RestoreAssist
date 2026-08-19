/**
 * XeroClient fetchClients / fetchJobs — high-volume where-filter avoidance.
 *
 * Xero Error 9191919 rejects Contact/Invoice `where` on large orgs. Sync must
 * paginate unfiltered (summaryOnly) and filter customers / ACCREC client-side.
 * Invoices must not combine summaryOnly with order=DateString (Xero 400).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokens = vi.fn();
const markIntegrationError = vi.fn();
const logSync = vi.fn();

vi.mock("@/lib/integrations/oauth-handler", () => ({
  getTokens: (...args: unknown[]) => getTokens(...args),
  storeTokens: vi.fn(),
  markIntegrationError: (...args: unknown[]) => markIntegrationError(...args),
  disconnectIntegration: vi.fn(),
  logSync: (...args: unknown[]) => logSync(...args),
  PROVIDER_CONFIG: {
    XERO: {
      name: "Xero",
      authUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      apiBaseUrl: "https://api.xero.com/api.xro/2.0",
      scopes: ["openid", "profile", "email", "accounting.contacts", "offline_access"],
      usePKCE: true,
    },
  },
}));

vi.mock("@/lib/integrations/dev-mode", () => ({
  isIntegrationDevMode: () => false,
  MOCK_CREDENTIALS: {},
}));
vi.mock("@/lib/integrations/mock-data", () => ({
  MOCK_CLIENTS: [],
  MOCK_JOBS: [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: vi.fn().mockResolvedValue({ tenantId: "tenant_1" }),
      update: vi.fn(),
    },
  },
}));

import {
  XeroClient,
  isCustomerContact,
  isSalesInvoice,
} from "../client";

beforeEach(() => {
  vi.clearAllMocks();
  getTokens.mockResolvedValue({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    isExpired: false,
  });
});

describe("isCustomerContact / isSalesInvoice", () => {
  it("keeps named customers only", () => {
    expect(isCustomerContact({ IsCustomer: true, Name: "Acme" })).toBe(true);
    expect(isCustomerContact({ IsCustomer: false, Name: "Vendor" })).toBe(false);
    expect(isCustomerContact({ IsCustomer: true, Name: "  " })).toBe(false);
    expect(isCustomerContact({ IsCustomer: true })).toBe(false);
  });

  it("keeps ACCREC sales invoices only", () => {
    expect(isSalesInvoice({ Type: "ACCREC" })).toBe(true);
    expect(isSalesInvoice({ Type: "ACCPAY" })).toBe(false);
  });
});

describe("XeroClient.fetchClients", () => {
  it("paginates Contacts without a where filter and keeps customers only", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Contacts: [
            {
              ContactID: "c1",
              ContactStatus: "ACTIVE",
              Name: "Customer One",
              IsCustomer: true,
              IsSupplier: false,
            },
            {
              ContactID: "s1",
              ContactStatus: "ACTIVE",
              Name: "Supplier Only",
              IsCustomer: false,
              IsSupplier: true,
            },
            {
              ContactID: "empty",
              ContactStatus: "ACTIVE",
              Name: "",
              IsCustomer: true,
              IsSupplier: false,
            },
          ],
          pagination: { page: 1, pageCount: 1, pageSize: 100 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new XeroClient("integ_1", "tenant_1");
    const clients = await client.fetchClients();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/Contacts\?summaryOnly=true&page=1&pageSize=100$/,
      ),
      expect.any(Object),
    );
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).not.toMatch(/where=/i);
    expect(calledUrl).not.toMatch(/IsCustomer/i);
    expect(calledUrl).not.toMatch(/order=/i);

    expect(clients).toHaveLength(1);
    expect(clients[0]).toEqual(
      expect.objectContaining({
        externalId: "c1",
        name: "Customer One",
      }),
    );
    expect(markIntegrationError).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe("XeroClient.fetchJobs", () => {
  it("paginates Invoices without Type where / DateString order and keeps ACCREC only", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Invoices: [
            {
              InvoiceID: "inv_sale",
              InvoiceNumber: "INV-1",
              Type: "ACCREC",
              Status: "AUTHORISED",
              Contact: { ContactID: "c1", Name: "Customer One" },
            },
            {
              InvoiceID: "inv_bill",
              InvoiceNumber: "BILL-1",
              Type: "ACCPAY",
              Status: "AUTHORISED",
            },
          ],
          pagination: { page: 1, pageCount: 1, pageSize: 100 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new XeroClient("integ_1", "tenant_1");
    const jobs = await client.fetchJobs();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/Invoices\?summaryOnly=true&page=1&pageSize=100$/,
      ),
      expect.any(Object),
    );
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).not.toMatch(/where=/i);
    expect(calledUrl).not.toMatch(/ACCREC/);
    expect(calledUrl).not.toMatch(/order=/i);
    expect(calledUrl).not.toMatch(/DateString/i);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        externalId: "inv_sale",
        title: "INV-1",
        status: "ACTIVE",
        clientExternalId: "c1",
      }),
    );
    expect(markIntegrationError).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
