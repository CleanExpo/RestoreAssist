/**
 * RA-6920 B5 — QuickBooks outbound invoice/contact push to Xero parity.
 *
 * Covers: invoice mapping (RA Invoice → QBO shape), customer upsert,
 * idempotent re-push (update, not duplicate), token-refresh on 401, and
 * non-recoverable 400 classification. Mocks global.fetch per the established
 * lib/integrations/quickbooks/__tests__/client.test.ts idiom.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getValidQuickBooksAccessToken = vi.fn();
vi.mock("@/lib/services/quickbooks/credentials", () => ({
  getValidQuickBooksAccessToken: (...args: unknown[]) =>
    getValidQuickBooksAccessToken(...args),
}));

import { syncInvoiceToQuickBooks } from "../quickbooks";

const integration = {
  id: "integ_qbo",
  accessToken: "qbo-token",
  realmId: "realm_1",
} as any;

function baseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "RA-2026-0001",
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-15",
    customerName: "Acme Restoration",
    customerEmail: "acme@example.com",
    customerPhone: "0400000000",
    currency: "AUD",
    discountAmount: 0,
    shippingAmount: 0,
    lineItems: [
      {
        description: "Water extraction",
        category: "Labour",
        quantity: 2,
        unitPrice: 5000, // $50.00 ex GST (cents)
        total: 11000, // $110.00 inc GST (cents)
        gstRate: 10,
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SANDBOX = "https://sandbox-quickbooks.api.intuit.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncInvoiceToQuickBooks — create", () => {
  it("maps the RA invoice to a QBO invoice and POSTs it", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;
        calls.push({ url, method, body });

        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({ QueryResponse: {} }); // no existing customer
        }
        if (url.endsWith("/customer") && method === "POST") {
          return jsonResponse({ Customer: { Id: "cust_1" } });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          return jsonResponse({
            Invoice: {
              Id: "inv_1",
              DocNumber: "RA-2026-0001",
              TotalAmt: 110,
              Balance: 110,
              Line: [],
            },
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    const result = await syncInvoiceToQuickBooks(baseInvoice(), integration);

    expect(result.invoiceId).toBe("inv_1");
    expect(result.provider).toBe("quickbooks");

    const invoicePost = calls.find(
      (c) => c.url === `${SANDBOX}/v3/company/realm_1/invoice` && c.method === "POST",
    );
    expect(invoicePost).toBeDefined();
    expect(invoicePost!.body.CustomerRef.value).toBe("cust_1");
    expect(invoicePost!.body.DocNumber).toBe("RA-2026-0001");
    expect(invoicePost!.body.Line[0].SalesItemLineDetail.Qty).toBe(2);
    expect(invoicePost!.body.Line[0].SalesItemLineDetail.UnitPrice).toBe(50);
    // GST line carries the AU tax code
    expect(invoicePost!.body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe(
      "GST",
    );
    // No Id on the create payload (not an update)
    expect(invoicePost!.body.Id).toBeUndefined();
  });
});

describe("syncInvoiceToQuickBooks — customer upsert", () => {
  it("updates an existing customer's contact details (sparse update)", async () => {
    const customerPosts: any[] = [];
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;

        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({
            QueryResponse: {
              Customer: [{ Id: "cust_9", SyncToken: "3" }],
            },
          });
        }
        if (url.endsWith("/customer") && method === "POST") {
          customerPosts.push(body);
          return jsonResponse({ Customer: { Id: "cust_9" } });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          return jsonResponse({
            Invoice: {
              Id: "inv_2",
              DocNumber: "RA-2026-0001",
              TotalAmt: 110,
              Balance: 110,
              Line: [],
            },
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    await syncInvoiceToQuickBooks(baseInvoice(), integration);

    expect(customerPosts).toHaveLength(1);
    expect(customerPosts[0].sparse).toBe(true);
    expect(customerPosts[0].Id).toBe("cust_9");
    expect(customerPosts[0].SyncToken).toBe("3");
    expect(customerPosts[0].PrimaryEmailAddr.Address).toBe("acme@example.com");
  });
});

describe("syncInvoiceToQuickBooks — idempotent re-push", () => {
  it("updates in place (no duplicate create) when externalInvoiceId is set", async () => {
    let createWithoutIdCalled = false;
    let updateBody: any;
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;

        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({ QueryResponse: {} });
        }
        if (url.endsWith("/customer") && method === "POST") {
          return jsonResponse({ Customer: { Id: "cust_1" } });
        }
        if (url.includes("/invoice/inv_existing") && method === "GET") {
          return jsonResponse({
            Invoice: { Id: "inv_existing", SyncToken: "7" },
          });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          if (!body.Id) createWithoutIdCalled = true;
          updateBody = body;
          return jsonResponse({
            Invoice: {
              Id: "inv_existing",
              DocNumber: "RA-2026-0001",
              TotalAmt: 110,
              Balance: 0,
              Line: [],
            },
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    const result = await syncInvoiceToQuickBooks(
      baseInvoice({
        externalInvoiceId: "inv_existing",
        externalSyncProvider: "quickbooks",
      }),
      integration,
    );

    expect(result.invoiceId).toBe("inv_existing");
    expect(createWithoutIdCalled).toBe(false);
    expect(updateBody.Id).toBe("inv_existing");
    expect(updateBody.SyncToken).toBe("7");
  });
});

describe("syncInvoiceToQuickBooks — error classification", () => {
  it("refreshes the token and throws (retryable) on 401", async () => {
    getValidQuickBooksAccessToken.mockResolvedValue({
      ok: true,
      data: "fresh-token",
    });
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({ QueryResponse: {} });
        }
        if (url.endsWith("/customer") && method === "POST") {
          return jsonResponse({ Customer: { Id: "cust_1" } });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          return jsonResponse({ Fault: { type: "AUTHENTICATION" } }, 401);
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    await expect(
      syncInvoiceToQuickBooks(baseInvoice(), integration),
    ).rejects.toThrow(/token refreshed, will retry/);
    expect(getValidQuickBooksAccessToken).toHaveBeenCalledWith("integ_qbo");
  });

  it("throws a non-recoverable error on a 400 that is not a duplicate", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({ QueryResponse: {} });
        }
        if (url.endsWith("/customer") && method === "POST") {
          return jsonResponse({ Customer: { Id: "cust_1" } });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          return jsonResponse(
            { Fault: { Error: [{ code: "2000", Message: "Invalid" }] } },
            400,
          );
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    await expect(
      syncInvoiceToQuickBooks(baseInvoice(), integration),
    ).rejects.toThrow(/non-recoverable/);
    expect(getValidQuickBooksAccessToken).not.toHaveBeenCalled();
  });

  it("recovers a duplicate DocNumber (6140) to the update path", async () => {
    let updateHappened = false;
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;

        if (url.includes("/query?query=") && url.includes("Customer")) {
          return jsonResponse({ QueryResponse: {} });
        }
        if (url.endsWith("/customer") && method === "POST") {
          return jsonResponse({ Customer: { Id: "cust_1" } });
        }
        if (url.includes("/query?query=") && url.includes("Invoice")) {
          return jsonResponse({ QueryResponse: { Invoice: [{ Id: "dup_1" }] } });
        }
        if (url.includes("/invoice/dup_1") && method === "GET") {
          return jsonResponse({ Invoice: { Id: "dup_1", SyncToken: "0" } });
        }
        if (url.endsWith("/invoice") && method === "POST") {
          if (body.Id === "dup_1") {
            updateHappened = true;
            return jsonResponse({
              Invoice: {
                Id: "dup_1",
                DocNumber: "RA-2026-0001",
                TotalAmt: 110,
                Balance: 110,
                Line: [],
              },
            });
          }
          return jsonResponse(
            { Fault: { Error: [{ code: "6140", Message: "Duplicate" }] } },
            400,
          );
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    const result = await syncInvoiceToQuickBooks(baseInvoice(), integration);
    expect(updateHappened).toBe(true);
    expect(result.invoiceId).toBe("dup_1");
  });
});
